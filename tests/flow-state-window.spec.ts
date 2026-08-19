// tests/flow-state-window.spec.ts - the MESSAGE WINDOW refreshFlowState folds from.
// Separate file because it needs a module mock (lib/openai) that the pure spec must
// not carry. No network, no DB.
//
// Two things are pinned here:
//  1. The fold window keeps the lead's own media rows. buildFlowPrompt explicitly
//     tells the extractor an answer can arrive labelled "[Image]:" /
//     "[Voice message]:" / "[Attached document]:", and the webhook backfills exactly
//     those rows' content with the transcript / document text / image description.
//     Only the OUTBOUND "(sent image: key)" asset rows (role=assistant) are dropped.
//  2. That set is the same one countStaleTurns counts. When the two drifted, one
//     numbered proof set aged the ledger past FLOW_STATE_MAX_STALE_TURNS on the turn
//     it was written and Layer B was silently dropped from the prompt.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeSupabaseStub, type StubRow } from "./supabase-stub";

/** Only the shape these tests read back; the real signature has more optional fields. */
type ChatArgs = { system: string; messages: { role: string; content: string }[] };
const openaiChat = vi.fn(async (_opts: ChatArgs) => ({ text: "answered|1|whats-going-on|score is 580", tokensUsed: 0 }));
vi.mock("@/lib/openai", () => ({ openaiChat: (o: ChatArgs) => openaiChat(o) }));

const { refreshFlowState, countStaleTurns, isFoldedRow } = await import("@/lib/flow-state");

const CONV = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const BOT = "11111111-2222-3333-4444-555555555555";

function rows(): StubRow[] {
  return [
    { role: "assistant", content: "(sent image: proof-1)", created_at: "2026-08-19T12:00:05.000Z", media_url: "assets/proof-1.jpg" },
    { role: "assistant", content: "here is what that looks like", created_at: "2026-08-19T12:00:04.000Z", media_url: null },
    { role: "user", content: "[Image]: score is 580", created_at: "2026-08-19T12:00:03.000Z", media_url: "uploads/screenshot.png" },
    { role: "assistant", content: "what does it say right now?", created_at: "2026-08-19T12:00:02.000Z", media_url: null },
    { role: "user", content: "hey", created_at: "2026-08-19T12:00:01.000Z", media_url: null },
  ];
}

describe("refreshFlowState fold window", () => {
  const prevEnabled = process.env.FLOW_STATE_ENABLED;
  beforeEach(() => {
    openaiChat.mockClear();
    process.env.FLOW_STATE_ENABLED = "true";
    delete process.env.FLOW_STATE_CHATBOT_IDS;
  });
  afterEach(() => {
    if (prevEnabled === undefined) delete process.env.FLOW_STATE_ENABLED;
    else process.env.FLOW_STATE_ENABLED = prevEnabled;
  });

  it("drops outbound asset rows but keeps the lead's own media rows", async () => {
    const stub = makeSupabaseStub(rows(), { flow_state: null, flow_state_at: null });
    await refreshFlowState({ supabase: stub.client, conversationId: CONV, chatbotId: BOT });

    expect(stub.messageFilters).not.toContain("is(media_url,null)");
    expect(stub.messageFilters).toContain("or(media_url.is.null,role.eq.user)");

    expect(openaiChat).toHaveBeenCalledTimes(1);
    const { messages } = openaiChat.mock.calls[0][0];
    const transcript = messages[0].content;
    expect(transcript).toContain("Lead: [Image]: score is 580");
    expect(transcript).not.toContain("(sent image: proof-1)");
  });

  it("folds exactly the rows countStaleTurns counts", () => {
    const folded = rows().filter(isFoldedRow);
    expect(folded).toHaveLength(4);
    // Every folded row is newer than this stamp; the asset row is neither folded nor
    // counted, so the two layers agree on the age.
    expect(countStaleTurns(rows(), "2026-08-19T12:00:00.000Z")).toBe(folded.length);
  });
});
