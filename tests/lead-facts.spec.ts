// tests/lead-facts.spec.ts - the MESSAGE WINDOW refreshKnownFacts extracts from.
// Committed (scripts/ is gitignored, so a shipping module's tests belong here).
//
// LEAD_FACTS_ENABLED defaults ON for every bot, so a regression in this window ships
// to all of them with no flag in front of it. The one pinned here: filtering the
// window to rows with a null media_url deletes the lead's own photo / voice note /
// document rows - and the webhook backfills exactly those rows' content with the
// transcript, document text or image description that buildFactsPrompt is written to
// mine ("[Image]:", "[Voice message]:", "[Attached document]:"). The rows that need
// dropping are the OUTBOUND "(sent image: key)" asset rows, which are role=assistant.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabaseStub, type StubRow } from "./supabase-stub";

/** Only the shape these tests read back; the real signature has more optional fields. */
type ChatArgs = { system: string; messages: { role: string; content: string }[] };
const openaiChat = vi.fn(async (_opts: ChatArgs) => ({ text: "- their score is 580", tokensUsed: 0 }));
vi.mock("@/lib/openai", () => ({ openaiChat: (o: ChatArgs) => openaiChat(o) }));

const { refreshKnownFacts } = await import("@/lib/lead-facts");

const CONV = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function rows(): StubRow[] {
  return [
    // Newest first, the order the query returns.
    { role: "assistant", content: "(sent image: proof-2)", created_at: "2026-08-19T12:00:06.000Z", media_url: "assets/proof-2.jpg" },
    { role: "assistant", content: "(sent image: proof-1)", created_at: "2026-08-19T12:00:05.000Z", media_url: "assets/proof-1.jpg" },
    { role: "assistant", content: "here is what that looks like", created_at: "2026-08-19T12:00:04.000Z", media_url: null },
    { role: "user", content: "[Image]: score is 580", created_at: "2026-08-19T12:00:03.000Z", media_url: "uploads/screenshot.png" },
    { role: "assistant", content: "what does it say right now?", created_at: "2026-08-19T12:00:02.000Z", media_url: null },
    { role: "user", content: "hey", created_at: "2026-08-19T12:00:01.000Z", media_url: null },
  ];
}

describe("refreshKnownFacts message window", () => {
  beforeEach(() => openaiChat.mockClear());

  it("keeps the lead's media rows and drops only outbound asset rows", async () => {
    const stub = makeSupabaseStub(rows(), { known_facts: null });
    await refreshKnownFacts({ supabase: stub.client, conversationId: CONV });

    // The filter must not be a blanket "text rows only".
    expect(stub.messageFilters).not.toContain("is(media_url,null)");
    expect(stub.messageFilters).toContain("or(media_url.is.null,role.eq.user)");
  });

  it("feeds the lead's attached-image content to the extractor", async () => {
    const stub = makeSupabaseStub(rows(), { known_facts: null });
    await refreshKnownFacts({ supabase: stub.client, conversationId: CONV });

    expect(openaiChat).toHaveBeenCalledTimes(1);
    const { messages } = openaiChat.mock.calls[0][0];
    // The row whose content the webhook backfilled from the attachment reaches the
    // prompt, labelled as the LEAD's - the whole point of the "[Image]:" instruction.
    expect(messages[0].content).toContain("Lead: [Image]: score is 580");
  });
});
