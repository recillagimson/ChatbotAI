import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { openaiChat, supportsCacheBreakpoint } from "@/lib/openai";
import { generateReply } from "@/lib/anthropic";
import type { Chatbot } from "@/lib/types";

/**
 * Token-cost plan step 2. On gpt-5.6 and later the system prompt goes to OpenAI as two
 * text parts: the fixed part (persona through confidentiality, the same on every reply
 * of a bot) marked as an explicit prompt-cache breakpoint, then the per-turn part. So a
 * new lead's first reply can read the bot's cached prefix, instead of relying on the
 * implicit breakpoint that lands after each lead's own message. The prompt text is
 * unchanged. Older models get the plain string, and a request whose breakpoint OpenAI
 * refuses is sent again without it, so a lead never gets the fallback line over it.
 */

type Part = { type: string; text: string; prompt_cache_breakpoint?: unknown };
type Body = { messages: { role: string; content: string | Part[] }[]; prompt_cache_options?: unknown };

function ok(): Response {
  return {
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => ({ choices: [{ message: { content: "hi" }, finish_reason: "stop" }], usage: { total_tokens: 5 } }),
  } as unknown as Response;
}
function bad(status: number, detail: string): Response {
  return { ok: false, status, text: async () => detail, json: async () => ({}) } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;
const sent = (i = 0) => JSON.parse(fetchMock.mock.calls[i][1].body as string) as Body;
const systemContent = (i = 0) => sent(i).messages[0].content;

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  fetchMock = vi.fn(async () => ok());
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const SYSTEM = "FIXED PART: persona and knowledge.\n\nPER TURN: what they told us.";
const FIXED = SYSTEM.indexOf("\n\nPER TURN");
const chat = (model: string, cacheBreakAt?: number) =>
  openaiChat({ model, system: SYSTEM, messages: [{ role: "user", content: "hi" }], cacheBreakAt });

describe("which models take a breakpoint", () => {
  it("gpt-5.6 and later do; older models do not", () => {
    expect(supportsCacheBreakpoint("gpt-5.6-luna")).toBe(true);
    expect(supportsCacheBreakpoint("gpt-5.6-terra")).toBe(true);
    expect(supportsCacheBreakpoint("gpt-5.7-luna")).toBe(true);
    expect(supportsCacheBreakpoint("gpt-6.0")).toBe(true);
    expect(supportsCacheBreakpoint("gpt-5.4-mini")).toBe(false);
    expect(supportsCacheBreakpoint("gpt-4.1-mini")).toBe(false);
    expect(supportsCacheBreakpoint("claude-haiku-5-5")).toBe(false);
  });
});

describe("the request", () => {
  it("on luna, the fixed part carries the breakpoint and the text is unchanged", async () => {
    await chat("gpt-5.6-luna", FIXED);
    const parts = systemContent() as Part[];
    expect(parts).toHaveLength(2);
    expect(parts[0]).toEqual({ type: "text", text: SYSTEM.slice(0, FIXED), prompt_cache_breakpoint: { mode: "explicit" } });
    expect(parts[1]).toEqual({ type: "text", text: SYSTEM.slice(FIXED) });
    expect(parts.map((p) => p.text).join("")).toBe(SYSTEM);
    // Implicit mode stays on (no prompt_cache_options), so today's breakpoint is still written too.
    expect(sent().prompt_cache_options).toBeUndefined();
  });

  it("a prompt with no per-turn part is one part, marked", async () => {
    await chat("gpt-5.6-luna", SYSTEM.length);
    expect(systemContent()).toEqual([{ type: "text", text: SYSTEM, prompt_cache_breakpoint: { mode: "explicit" } }]);
  });

  it("an older model gets the plain string, breakpoint or not", async () => {
    await chat("gpt-5.4-mini", FIXED);
    expect(systemContent()).toBe(SYSTEM);
  });

  it("without a breakpoint the request is as before", async () => {
    await chat("gpt-5.6-luna");
    expect(systemContent()).toBe(SYSTEM);
  });
});

describe("if OpenAI refuses the breakpoint", () => {
  // gpt-5.7-luna here: a refusal is remembered per model for the life of the instance,
  // so these tests must not touch the models the other tests use.
  it("the same request goes again without it, and that model goes plain from then on", async () => {
    fetchMock.mockResolvedValueOnce(bad(400, '{"error":{"message":"Unknown parameter: messages[0].content[0].prompt_cache_breakpoint"}}'));
    const r = await chat("gpt-5.7-luna", FIXED);
    expect(r.text).toBe("hi");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(systemContent(1)).toBe(SYSTEM);

    await chat("gpt-5.7-luna", FIXED);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(systemContent(2)).toBe(SYSTEM);
  });

  it("any other 400 is not retried, a cache-key error included", async () => {
    fetchMock.mockResolvedValueOnce(bad(400, '{"error":{"message":"Invalid image"}}'));
    await expect(chat("gpt-5.6-luna", FIXED)).rejects.toThrow("Invalid image");
    fetchMock.mockResolvedValueOnce(bad(400, '{"error":{"message":"Invalid prompt_cache_key"}}'));
    await expect(chat("gpt-5.6-luna", FIXED)).rejects.toThrow("prompt_cache_key");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("a reply on a luna bot", () => {
  const bot = {
    id: "b1",
    name: "Bot",
    tone: "friendly",
    persona_section: "Be brief.",
    reply_model: "gpt-5.6-luna",
  } as unknown as Chatbot;

  it("puts the breakpoint after the knowledge base and before the per-turn memory", async () => {
    await generateReply({
      chatbot: bot,
      kbBlock: "Price: $97 a month.",
      history: [{ role: "user", content: "hi" }, { role: "assistant", content: "Hey!" }] as never,
      userMessage: "how much?",
      memorySummary: "They asked about the price last week.",
    });
    const parts = systemContent() as Part[];
    expect(parts).toHaveLength(2);
    expect(parts[0].prompt_cache_breakpoint).toEqual({ mode: "explicit" });
    expect(parts[0].text).toContain("Price: $97 a month.");
    expect(parts[0].text).not.toContain("They asked about the price last week.");
    expect(parts[1].text).toContain("They asked about the price last week.");
    expect(parts[1].prompt_cache_breakpoint).toBeUndefined();
  });

  it("a bot on the older custom-prompt layout gets no breakpoint once per-turn text is mixed in", async () => {
    // That layout puts memory and facts INSIDE the prompt, so no prefix is shared across
    // leads; a breakpoint there would only add a lead-specific cache write.
    await generateReply({
      chatbot: { ...bot, persona_section: "", system_prompt: "You are Evan, a funding advisor." } as Chatbot,
      kbBlock: "Price: $97 a month.",
      history: [{ role: "user", content: "hi" }, { role: "assistant", content: "Hey!" }] as never,
      userMessage: "how much?",
      memorySummary: "They asked about the price last week.",
    });
    const content = systemContent();
    expect(typeof content).toBe("string");
    expect(content).toContain("You are Evan");
  });

  it("the same reply on gpt-5.4-mini sends one plain prompt", async () => {
    await generateReply({
      chatbot: { ...bot, reply_model: "gpt-5.4-mini" } as Chatbot,
      kbBlock: "Price: $97 a month.",
      history: [],
      userMessage: "how much?",
      memorySummary: "They asked about the price last week.",
    });
    const content = systemContent();
    expect(typeof content).toBe("string");
    expect(content).toContain("Price: $97 a month.");
    expect(content).toContain("They asked about the price last week.");
  });
});
