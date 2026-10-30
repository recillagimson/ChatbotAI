import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import type { Chatbot } from "@/lib/types";

/**
 * Per-bot reply provider. A bot whose reply model (Overview tab, superadmin) is a Claude
 * model gets its replies from Anthropic; every other bot stays on OpenAI. If Claude fails
 * (credit ran out, key missing, outage), the reply comes from the bot's OpenAI default
 * instead, so the lead still gets an answer. On Claude only the fixed part of the prompt
 * is marked for caching; the per-turn blocks after it change every reply.
 */

const openaiChat = vi.fn();
const claudeCreate = vi.fn();

vi.mock("@/lib/openai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/openai")>()),
  openaiChat: (...a: unknown[]) => openaiChat(...a),
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: (...a: unknown[]) => claudeCreate(...a) };
  },
}));

let generateReply: (typeof import("@/lib/anthropic"))["generateReply"];
let ALLOWED_REPLY_MODELS: readonly string[];
let MODELS: (typeof import("@/lib/model-tiers"))["MODELS"];
beforeAll(async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  ({ generateReply } = await import("@/lib/anthropic"));
  ({ ALLOWED_REPLY_MODELS, MODELS } = await import("@/lib/model-tiers"));
}, 120_000);

const bot = (reply_model: string | null) =>
  ({
    id: "b1",
    name: "Bot",
    tone: "friendly",
    persona_section: "Be brief.",
    reply_model,
  }) as unknown as Chatbot;

const reply = (chatbot: Chatbot, extra: Record<string, unknown> = {}) =>
  generateReply({ chatbot, kbBlock: "Price: $97 a month.", history: [], userMessage: "how much?", ...extra });

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  openaiChat.mockReset().mockResolvedValue({ text: "from openai", tokensUsed: 10, finishReason: "stop", refusal: null });
  claudeCreate.mockReset().mockResolvedValue({
    content: [{ type: "text", text: "from claude" }],
    usage: { input_tokens: 5, output_tokens: 3, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    stop_reason: "end_turn",
  });
});
afterEach(() => vi.restoreAllMocks());

describe("which provider answers a bot", () => {
  it("offers Claude models in the per-bot picker", () => {
    expect(ALLOWED_REPLY_MODELS).toContain("claude-haiku-5-5");
    expect(ALLOWED_REPLY_MODELS).toContain("claude-sonnet-5-5");
  });

  it("a bot set to a Claude model is answered by Claude, with that model", async () => {
    const r = await reply(bot("claude-haiku-5-5"));
    expect(r.text).toBe("from claude");
    expect(claudeCreate.mock.calls[0][0]).toMatchObject({ model: "claude-haiku-5-5" });
    expect(openaiChat).not.toHaveBeenCalled();
  });

  it("a bot on an OpenAI model, or on the default, stays on OpenAI", async () => {
    await reply(bot("gpt-5.6-luna"));
    expect(openaiChat.mock.calls[0][0]).toMatchObject({ model: "gpt-5.6-luna" });
    await reply(bot(null));
    expect(openaiChat.mock.calls[1][0]).toMatchObject({ model: MODELS.reply() });
    expect(claudeCreate).not.toHaveBeenCalled();
  });

  it("if Claude fails (e.g. the credit ran out), the bot's OpenAI default answers instead", async () => {
    claudeCreate.mockRejectedValue(new Error("Your credit balance is too low to access the Anthropic API."));
    const r = await reply(bot("claude-sonnet-5-5"));
    expect(r.text).toBe("from openai");
    expect(openaiChat.mock.calls[0][0]).toMatchObject({ model: MODELS.reply() });
  });

  it("if OpenAI also fails after Claude, the error reaches the caller (the webhook's canned line)", async () => {
    claudeCreate.mockRejectedValue(new Error("overloaded"));
    openaiChat.mockRejectedValue(new Error("openai down"));
    await expect(reply(bot("claude-haiku-5-5"))).rejects.toThrow("openai down");
  });

  it("under a reply deadline, Claude gets only the time left and no retries", async () => {
    await reply(bot("claude-haiku-5-5"), { deadlineAt: Date.now() + 5_000 });
    const options = claudeCreate.mock.calls[0][1] as { timeout: number; maxRetries: number };
    expect(options.maxRetries).toBe(0);
    expect(options.timeout).toBeGreaterThan(4_000);
    expect(options.timeout).toBeLessThanOrEqual(5_000);
  });

  it("follow-ups ignore the bot's model and keep the OpenAI default", async () => {
    await reply(bot("claude-haiku-5-5"), { ignoreReplyModel: true });
    expect(claudeCreate).not.toHaveBeenCalled();
    expect(openaiChat.mock.calls[0][0]).toMatchObject({ model: MODELS.reply() });
  });
});

describe("token detail on the reply (usage_log, token-cost plan step 1)", () => {
  it("an OpenAI reply reports its model and token split, and leaves the row to the webhook", async () => {
    const detail = { model: "gpt-5.6-luna", inputTokens: 8, cachedTokens: 4, outputTokens: 2 };
    openaiChat.mockResolvedValueOnce({ text: "hi", tokensUsed: 10, finishReason: "stop", refusal: null, detail });
    const r = await reply(bot("gpt-5.6-luna"));
    expect(r.detail).toEqual(detail);
    // The webhook writes the ai_reply row itself; a tag here would count the reply twice.
    expect(openaiChat.mock.calls[0][0].usage).toBeUndefined();
  });

  it("a Claude reply counts cache reads as cached input, and cache writes as input", async () => {
    claudeCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "from claude" }],
      usage: { input_tokens: 100, output_tokens: 30, cache_read_input_tokens: 5000, cache_creation_input_tokens: 200 },
      stop_reason: "end_turn",
    });
    const r = await reply(bot("claude-haiku-5-5"));
    expect(r.detail).toEqual({ model: "claude-haiku-5-5", inputTokens: 5300, cachedTokens: 5000, outputTokens: 30 });
    expect(r.tokensUsed).toBe(5330);
  });
});

describe("caching on Claude", () => {
  type Block = { text: string; cache_control?: unknown };
  const system = () => claudeCreate.mock.calls[0][0].system as Block[];

  it("caches only the fixed part; the per-turn blocks follow, uncached", async () => {
    await reply(bot("claude-haiku-5-5"), { memorySummary: "They asked about the price last week." });
    const [fixed, perTurn] = system();
    expect(fixed.cache_control).toEqual({ type: "ephemeral" });
    expect(fixed.text).toContain("Price: $97 a month.");
    expect(fixed.text).not.toContain("They asked about the price last week.");
    expect(perTurn.cache_control).toBeUndefined();
    expect(perTurn.text).toContain("They asked about the price last week.");
  });

  it("on Instagram, mid-conversation, the fixed part is still cached on its own", async () => {
    // Instagram's no-links rule rides in the per-turn tail, so the fixed part must be
    // rebuilt without it or it never matches the start of the real prompt.
    const history = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "Hey! What are you looking for?" },
    ];
    await reply(bot("claude-haiku-5-5"), { platform: "instagram", history, knownFacts: "- Name: Sam" });
    expect(system()).toHaveLength(2);
    expect(system()[0].text).not.toContain("Sam");
    expect(system()[1].text).toContain("Sam");
  });

  it("with no per-turn blocks the whole prompt is one cached block", async () => {
    await reply(bot("claude-haiku-5-5"));
    expect(system()).toHaveLength(1);
    expect(system()[0].cache_control).toEqual({ type: "ephemeral" });
  });
});
