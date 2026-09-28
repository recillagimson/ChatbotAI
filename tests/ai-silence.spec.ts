import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { openaiChat } from "@/lib/openai";
import { generateReply } from "@/lib/anthropic";
import type { Chatbot } from "@/lib/types";
import { code, callArgs } from "./helpers/source";

/**
 * When the AI deliberately says nothing.
 *
 * The incident (2026-09-28, HTKeem Bot): the client's prompt has lanes that end with
 * "go quiet so the human picks it up" (after quoting the 1-on-1 mentorship, a vendor
 * pitch, "are you a bot" twice...). The model obeyed: a normal 2xx completion with
 * EMPTY content. The webhook read an empty reply as a failure and sent the canned
 * "Thanks for the message, a teammate will follow up shortly." instead, twice, which
 * that client's own rebuttals forbid (a promised human who never comes). Every canned
 * fallback on any bot in the prior 30 days landed on such a "go quiet" turn.
 *
 * Now: an empty answer is SILENCE (nothing is sent, the thread is flagged "Needs
 * attention" so a person picks it up, and why is logged). The canned line stays only
 * for real failures (the call threw).
 *
 * Also pinned here: the owner's own manual replies (role human_agent) reach the model
 * as the business's side of the chat, never as if the lead had written them.
 */

const WEBHOOK = "app/api/webhooks/manychat/route.ts";

function completion(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => body,
  } as unknown as Response;
}

function bot(): Chatbot {
  return {
    id: "b1",
    name: "Test",
    persona_section: "You are the assistant.",
    offers_section: null,
    rebuttals_section: null,
    system_prompt: null,
    tone: "friendly",
    business_description: null,
    training_pairs: [],
    link_flow_enabled: false,
    reply_model: null,
  } as unknown as Chatbot;
}

const savedKey = process.env.OPENAI_API_KEY;
beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-key";
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = savedKey;
});

describe("openaiChat reports WHY a reply came back empty", () => {
  it("a deliberate empty answer (finish_reason stop) is returned, not thrown, with its reason and real tokens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        completion({ choices: [{ message: { content: "" }, finish_reason: "stop" }], usage: { total_tokens: 38000 } })
      )
    );
    const r = await openaiChat({ model: "m", system: "s", messages: [{ role: "user", content: "hi" }] });
    expect(r.text).toBe("");
    expect(r.tokensUsed).toBe(38000);
    expect(r.finishReason).toBe("stop");
    expect(r.refusal).toBeNull();
  });

  it("a safety refusal (content null + refusal) is surfaced", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        completion({
          choices: [{ message: { content: null, refusal: "I can't help with that." }, finish_reason: "stop" }],
          usage: { total_tokens: 12 },
        })
      )
    );
    const r = await openaiChat({ model: "m", system: "s", messages: [{ role: "user", content: "hi" }] });
    expect(r.text).toBe("");
    expect(r.refusal).toBe("I can't help with that.");
  });

  it("a normal reply still carries its finish reason", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        completion({ choices: [{ message: { content: "hey" }, finish_reason: "stop" }], usage: { total_tokens: 5 } })
      )
    );
    const r = await openaiChat({ model: "m", system: "s", messages: [{ role: "user", content: "hi" }] });
    expect(r).toMatchObject({ text: "hey", tokensUsed: 5, finishReason: "stop", refusal: null });
  });
});

describe("generateReply", () => {
  it("passes the empty answer's reason through", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        completion({ choices: [{ message: { content: "" }, finish_reason: "stop" }], usage: { total_tokens: 900 } })
      )
    );
    const r = await generateReply({ chatbot: bot(), kbBlock: "", history: [], userMessage: "What happens after 3 months?" });
    expect(r.text).toBe("");
    expect(r.tokensUsed).toBe(900);
    expect(r.finishReason).toBe("stop");
    expect(r.refused).toBe(false);
  });

  it("sends the owner's manual replies as the business's turns, not the lead's", async () => {
    const fetchMock = vi.fn(async () =>
      completion({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }], usage: { total_tokens: 5 } })
    );
    vi.stubGlobal("fetch", fetchMock);
    await generateReply({
      chatbot: bot(),
      kbBlock: "",
      history: [
        { role: "user", content: "how much for mentorship" },
        { role: "assistant", content: "it's $2,500 for 3 months" },
        { role: "human_agent", content: "hey it's Keem, happy to set that up with you" },
      ],
      userMessage: "cool, what's next?",
    });
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body) as {
      messages: { role: string; content: unknown }[];
    };
    const turns = sent.messages.filter((m) => m.role !== "system");
    expect(turns).toEqual([
      { role: "user", content: "how much for mentorship" },
      { role: "assistant", content: "it's $2,500 for 3 months" },
      { role: "assistant", content: "hey it's Keem, happy to set that up with you" },
      { role: "user", content: "cool, what's next?" },
    ]);
  });
});

describe("resolveAiReply: what the webhook does with the model's answer", () => {
  it("a reply is sent as written", async () => {
    const { resolveAiReply } = await import("@/lib/ai-reply");
    expect(resolveAiReply({ text: "for sure" })).toEqual({ kind: "reply", text: "for sure" });
  });

  it("an empty answer is silence, never the canned line", async () => {
    const { resolveAiReply } = await import("@/lib/ai-reply");
    expect(resolveAiReply({ text: "" })).toEqual({ kind: "silent" });
    expect(resolveAiReply({ text: "   " })).toEqual({ kind: "silent" });
  });

  it("only a real failure (the call threw) gets the canned fallback", async () => {
    const { resolveAiReply, AI_FAILURE_FALLBACK } = await import("@/lib/ai-reply");
    expect(resolveAiReply(null)).toEqual({ kind: "fallback", text: AI_FAILURE_FALLBACK });
    expect(AI_FAILURE_FALLBACK).toBe("Thanks for the message, a teammate will follow up shortly.");
  });
});

describe("responseChannelReply: the text a response channel (TikTok) returns", () => {
  it("returns the turn's text, empty on a silent turn (no message, never the canned line)", async () => {
    const { responseChannelReply } = await import("@/lib/ai-reply");
    expect(responseChannelReply({ text: "for sure" })).toBe("for sure");
    expect(responseChannelReply({ text: "" })).toBe("");
  });

  it("falls back to the canned line only when there is no result (a failure or stand-down)", async () => {
    const { responseChannelReply, AI_FAILURE_FALLBACK } = await import("@/lib/ai-reply");
    expect(responseChannelReply(null)).toBe(AI_FAILURE_FALLBACK);
  });
});

describe("the webhook wiring", () => {
  it("decides through resolveAiReply / responseChannelReply and never names the canned line itself", () => {
    const src = code(WEBHOOK);
    expect(src).toMatch(/resolveAiReply\(generated\)/);
    expect(src).toMatch(/responseChannelReply\(syncResult\)/);
    expect(src).not.toMatch(/a teammate will follow up shortly/);
    // The fallback only ever comes out of lib/ai-reply.ts (a thrown call / no result).
    expect(src).not.toMatch(/AI_FAILURE_FALLBACK/);
  });

  it("a silent turn's text is empty, and no assistant row is saved for empty text", () => {
    const src = code(WEBHOOK);
    expect(src).toMatch(/let replyText\s*=\s*outcome\.kind\s*===\s*"silent"\s*\?\s*""\s*:\s*outcome\.text/);
    expect(src).toMatch(
      /if \(replyText\) \{\s*await supabase\.from\("messages"\)\.insert\(\{\s*conversation_id: conversationId!,\s*role: "assistant",\s*content: replyText/
    );
  });

  it("logs a silent turn as ai_silent (with the real tokens), not as a sent reply", () => {
    const src = code(WEBHOOK);
    expect(src).toMatch(/silent\s*\?\s*"ai_silent"\s*:\s*"ai_reply"/);
  });

  it("flags a silent thread needs_human, even with auto-tagging off or on a response channel", () => {
    const src = code(WEBHOOK);
    expect(src).toMatch(/handoff\.handoff\s*\|\|\s*silent/);
    expect(src).toMatch(/\(AUTO_TAG_ENABLED\s*\|\|\s*silent\)/);
    expect(src).toMatch(/\(canPushPlatform\(platform\)\s*\|\|\s*silent\)/);
  });

  it("the response-channel path waits for that flag to be written", () => {
    const src = code(WEBHOOK);
    const syncAfter = callArgs(src, "after").find(
      (a) => a.includes("refreshConversationMemory") && !a.includes("generateAndPersistReply")
    );
    expect(syncAfter).toBeDefined();
    expect(syncAfter!).toMatch(/[tT]agWork/);
  });
});
