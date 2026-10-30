import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { insertUsageRow, usageTag, type AiUsageTag } from "@/lib/usage-log";
import { openaiChat } from "@/lib/openai";
import { screenInquiryRelevance } from "@/lib/question-gate";
import { screenDisqualify } from "@/lib/conversation-screen";
import { classifyConversation } from "@/lib/conversation-classify";
import { updateKnownFacts, refreshKnownFacts } from "@/lib/lead-facts";
import { summarizeConversation, refreshConversationMemory } from "@/lib/memory";
import { updateFlowState, refreshFlowState } from "@/lib/flow-state";
import { describeImage } from "@/lib/vision";
import { chatTurn } from "@/lib/openai-changes";

/**
 * Token cost per bot (docs/plans/token-cost-plan.md step 1). Every AI call records
 * which model ran and how many input tokens it read, how many of those came from the
 * prompt cache, and how many it wrote, so cost per bot and the cache hit rate can be
 * read straight from usage_log. The reply's own ai_reply row carries the split; each
 * side call (screen, tags, facts, memory, flow state, image description, dashboard
 * tools) leaves a row of its own. The new columns arrive with a migration the owner
 * applies; until then every row is still written, without them.
 */

const USAGE = {
  prompt_tokens: 1200,
  completion_tokens: 40,
  total_tokens: 1240,
  prompt_tokens_details: { cached_tokens: 1024 },
};

function ok(content: string): Response {
  return {
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => ({ choices: [{ message: { content }, finish_reason: "stop" }], usage: USAGE }),
  } as unknown as Response;
}

/** usage_log stand-in: records each insert; `errors[i]` is what insert i returns. */
function fakeDb(errors: ({ code: string; message: string } | null)[] = []) {
  const rows: Record<string, unknown>[] = [];
  let i = 0;
  const db = {
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        rows.push({ table, ...row });
        return { error: errors[i++] ?? null };
      },
    }),
  };
  return { db: db as unknown as SupabaseClient, rows };
}

/**
 * A whole-thread stand-in for the after-reply refreshers: every query chain resolves
 * to the same messages (or the conversation row), and usage_log inserts are recorded.
 */
function threadDb() {
  const rows: Record<string, unknown>[] = [];
  const messages = Array.from({ length: 30 }, (_, n) => ({
    role: n % 2 ? "assistant" : "user",
    content: n % 2 ? "What's your budget?" : "I'm Sam, about $500",
    created_at: new Date(Date.UTC(2026, 9, 1, 0, 30 - n)).toISOString(),
  }));
  const from = (table: string) => {
    const result =
      table === "messages"
        ? { data: messages, count: messages.length, error: null }
        : table === "conversations"
          ? { data: { known_facts: null, memory_summary: null, memory_summary_at: null, flow_state: null, flow_state_at: null }, error: null }
          : { data: null, error: null };
    const chain: unknown = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === "then") return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej);
          if (prop === "insert")
            return (row: Record<string, unknown>) => {
              rows.push({ table, ...row });
              return Promise.resolve({ error: null });
            };
          return () => chain;
        },
      }
    );
    return chain;
  };
  return { db: { from } as unknown as SupabaseClient, rows };
}

const BOT = { id: "bot-1", user_id: "owner-1" };
const usageRows = (rows: Record<string, unknown>[]) => rows.filter((r) => r.table === "usage_log");

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  fetchMock = vi.fn(async () => ok("none"));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("a usage row", () => {
  const base = { user_id: "owner-1", chatbot_id: "bot-1", event_type: "ai_reply", tokens_used: 1240 };
  const detail = { model: "gpt-5.6-luna", inputTokens: 1200, cachedTokens: 1024, outputTokens: 40 };

  it("records the model and the input / cached / output split", async () => {
    const { db, rows } = fakeDb();
    await insertUsageRow(db, base, detail);
    expect(rows).toEqual([
      { table: "usage_log", ...base, model: "gpt-5.6-luna", input_tokens: 1200, cached_tokens: 1024, output_tokens: 40 },
    ]);
  });

  it("before the migration is applied, the row is still written, without the new columns", async () => {
    // PostgREST's answer for an insert naming a column the table does not have.
    const { db, rows } = fakeDb([{ code: "PGRST204", message: "Could not find the 'model' column of 'usage_log' in the schema cache" }]);
    await insertUsageRow(db, base, detail);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({ table: "usage_log", ...base });
  });

  it("any other failure is not retried, and never reaches the caller", async () => {
    const { db, rows } = fakeDb([{ code: "23503", message: "violates foreign key constraint" }]);
    await expect(insertUsageRow(db, base, detail)).resolves.toBeUndefined();
    expect(rows).toHaveLength(1);
    const broken = { from: () => { throw new Error("db down"); } } as unknown as SupabaseClient;
    await expect(insertUsageRow(broken, base, detail)).resolves.toBeUndefined();
  });

  it("a tag names the bot's owner and the bot", () => {
    const { db } = fakeDb();
    expect(usageTag(db, BOT, "ai_call_screen")).toEqual({ db, userId: "owner-1", chatbotId: "bot-1", event: "ai_call_screen" });
  });
});

describe("an AI call", () => {
  it("reports the model and OpenAI's token split", async () => {
    const r = await openaiChat({ model: "gpt-5.4-nano", system: "s", messages: [{ role: "user", content: "hi" }] });
    expect(r.detail).toEqual({ model: "gpt-5.4-nano", inputTokens: 1200, cachedTokens: 1024, outputTokens: 40 });
    expect(r.tokensUsed).toBe(1240);
  });

  it("with a usage tag, leaves exactly one row under its event", async () => {
    const { db, rows } = fakeDb();
    await openaiChat({
      model: "gpt-5.4-nano",
      system: "s",
      messages: [{ role: "user", content: "hi" }],
      usage: usageTag(db, BOT, "ai_call_training_suggest"),
    });
    expect(rows).toEqual([
      {
        table: "usage_log",
        user_id: "owner-1",
        chatbot_id: "bot-1",
        event_type: "ai_call_training_suggest",
        tokens_used: 1240,
        model: "gpt-5.4-nano",
        input_tokens: 1200,
        cached_tokens: 1024,
        output_tokens: 40,
      },
    ]);
  });

  it("a row that fails to save does not fail the call", async () => {
    const broken = { from: () => { throw new Error("db down"); } } as unknown as SupabaseClient;
    const r = await openaiChat({
      model: "gpt-5.4-nano",
      system: "s",
      messages: [{ role: "user", content: "hi" }],
      usage: { db: broken, userId: "owner-1", chatbotId: "bot-1", event: "ai_call_screen" },
    });
    expect(r.text).toBe("none");
  });

  it("an older answer without the split counts zeros, never a crash", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({ choices: [{ message: { content: "x" } }], usage: { total_tokens: 5 } }),
    } as unknown as Response);
    const r = await openaiChat({ model: "gpt-4.1-mini", system: "s", messages: [{ role: "user", content: "hi" }] });
    expect(r.detail).toEqual({ model: "gpt-4.1-mini", inputTokens: 0, cachedTokens: 0, outputTokens: 0 });
  });
});

describe("every side call leaves its own row", () => {
  const msgs = [
    { role: "assistant", content: "What's your name?" },
    { role: "user", content: "I'm Sam" },
  ];
  const cases: [string, (usage: AiUsageTag) => Promise<unknown>][] = [
    ["ai_call_question_gate", (usage) => screenInquiryRelevance({ text: "how much does it cost to start?", botName: "B", businessContext: "credit repair", usage })],
    ["ai_call_screen", (usage) => screenDisqualify({ message: "you are a useless bot", lastBotMessage: "Hi!", usage })],
    ["ai_call_tags", (usage) => classifyConversation({ userMessage: "I just paid", botReply: "Welcome!", today: "2026-10-30", usage })],
    ["ai_call_facts", (usage) => updateKnownFacts(null, msgs, usage)],
    ["ai_call_memory", (usage) => summarizeConversation(null, msgs, usage)],
    ["ai_call_flow_state", (usage) => updateFlowState(null, msgs, usage)],
    ["ai_call_vision", (usage) => describeImage({ base64: "aGk=", mediaType: "image/png", usage })],
  ];

  it.each(cases)("%s", async (event, run) => {
    const { db, rows } = fakeDb();
    await run(usageTag(db, BOT, event));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event_type: event, chatbot_id: "bot-1", user_id: "owner-1", input_tokens: 1200, cached_tokens: 1024, output_tokens: 40 });
    expect(typeof rows[0].model).toBe("string");
  });

  it("the after-reply refreshers pass their tag down to the call", async () => {
    vi.stubEnv("FLOW_STATE_ENABLED", "true");
    const { db, rows } = threadDb();
    await refreshKnownFacts({ supabase: db, conversationId: "c1", usage: usageTag(db, BOT, "ai_call_facts") });
    await refreshConversationMemory({ supabase: db, conversationId: "c1", usage: usageTag(db, BOT, "ai_call_memory") });
    await refreshFlowState({ supabase: db, conversationId: "c1", chatbotId: "bot-1", usage: usageTag(db, BOT, "ai_call_flow_state") });
    expect(usageRows(rows).map((r) => r.event_type)).toEqual(["ai_call_facts", "ai_call_memory", "ai_call_flow_state"]);
  });

  it("without a tag a side call writes nothing", async () => {
    const { db, rows } = threadDb();
    await refreshKnownFacts({ supabase: db, conversationId: "c1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(usageRows(rows)).toEqual([]);
  });

  it("the change assistant leaves a row for its OpenAI call", async () => {
    fetchMock.mockResolvedValueOnce(ok("What tone would you like?"));
    const { db, rows } = fakeDb();
    await chatTurn({
      chatbot: { name: "B" },
      kbEntries: [],
      messages: [{ role: "user", content: "make it friendlier" }],
      category: "other",
      currentSection: "",
      usage: usageTag(db, BOT, "ai_call_change_assistant"),
    });
    expect(rows).toEqual([
      expect.objectContaining({ event_type: "ai_call_change_assistant", input_tokens: 1200, cached_tokens: 1024, output_tokens: 40, tokens_used: 1240 }),
    ]);
  });
});
