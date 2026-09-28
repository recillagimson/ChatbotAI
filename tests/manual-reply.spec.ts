import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as mw from "@/lib/messaging-window";
import * as mc from "@/lib/manychat";
import { hasUnicodeDash } from "@/lib/sanitize";
import { code, callArgs } from "./helpers/source";

/**
 * Manual replies from the conversation composer (POST /api/conversations/[id]/reply).
 *
 * The incident (2026-09-28, HTKeem Bot): every manual send failed with "Couldn't
 * deliver the message to Instagram", while the AI's replies to the SAME lead, with the
 * SAME ManyChat key, went through minutes apart. The only difference in the request was
 * `message_tag: "HUMAN_AGENT"`, which the route added to every Instagram/Messenger send.
 * ManyChat's public API does not accept that tag: ManyChat applies HUMAN_AGENT itself,
 * only to messages typed in its own Inbox. No manual reply had been saved on any bot
 * since the tag was added (2026-07-27).
 *
 * So: a manual send goes out exactly like the AI's reply (no tag), and when ManyChat
 * refuses one, the owner sees ManyChat's reason (and, past the 24h window, where they
 * can still reply) instead of a bare "Please try again".
 */

const NOW = Date.parse("2026-09-28T19:35:35Z");
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const LIVE_CHAT_URL = "https://app.manychat.com/fb3632943/chat/1842539971";

// ---------------------------------------------------------------------------
// Route harness: the real route handler over a tiny recording Supabase stand-in.
// ---------------------------------------------------------------------------

const sendSpy = vi.fn();
let conversationRow: Record<string, unknown> | null;
let lastInbound: { created_at: string } | null;
let inserts: { table: string; row: Record<string, unknown> }[];

function query(table: string) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit", "update", "in", "is"]) {
    chain[m] = () => chain;
  }
  const result = () => {
    if (table === "conversations") return { data: conversationRow, error: conversationRow ? null : { message: "not found" } };
    if (table === "chatbots") return { data: { manychat_api_key_enc: "enc", link_buttons_enabled: false }, error: null };
    if (table === "messages") return { data: lastInbound, error: null };
    return { data: null, error: null };
  };
  chain.single = async () => result();
  chain.maybeSingle = async () => result();
  chain.insert = async (row: Record<string, unknown>) => {
    inserts.push({ table, row });
    return { data: null, error: null };
  };
  // `await supabase.from(t).update(...).eq(...)` resolves the chain itself.
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null });
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  getCurrentUser: async () => ({ id: "owner-1", email: null }),
  createClient: async () => ({ from: (table: string) => query(table) }),
}));

vi.mock("@/lib/manychat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/manychat")>()),
  resolveManychatApiKey: () => "mc-key",
  sendManychatMessage: (...args: unknown[]) => sendSpy(...args),
}));

async function postReply(text = "hey, happy to walk you through it") {
  const { POST } = await import("@/app/api/conversations/[id]/reply/route");
  const res = await POST(
    new NextRequest("http://localhost/api/conversations/c1/reply", {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
    { params: Promise.resolve({ id: "c1" }) }
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

function conversation(platform = "instagram") {
  return {
    id: "c1",
    chatbot_id: "b1",
    platform,
    manychat_subscriber_id: "1842539971",
    manychat_page_id: "145778989612199",
    manychat_live_chat_url: LIVE_CHAT_URL,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  sendSpy.mockReset();
  sendSpy.mockResolvedValue({});
  conversationRow = conversation();
  lastInbound = { created_at: new Date(NOW - 2 * MIN).toISOString() };
  inserts = [];
});

describe("sending a manual reply", () => {
  it("goes out untagged, the same send the AI's replies use (the incident)", async () => {
    const { status } = await postReply();
    expect(status).toBe(200);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const opts = sendSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(opts.messageTag).toBeUndefined();
    expect(opts.subscriberId).toBe("1842539971");
    expect(opts.platform).toBe("instagram");
    // Delivered, so it's recorded in the thread as the owner's message.
    expect(inserts).toEqual([
      { table: "messages", row: expect.objectContaining({ role: "human_agent", conversation_id: "c1" }) },
    ]);
  });

  it("never carries a message tag, however long ago the lead wrote, on Messenger too", async () => {
    for (const [platform, ago] of [
      ["instagram", 30 * HOUR],
      ["messenger", 5 * DAY],
    ] as const) {
      sendSpy.mockClear();
      conversationRow = conversation(platform);
      lastInbound = { created_at: new Date(NOW - ago).toISOString() };
      await postReply();
      expect((sendSpy.mock.calls[0][0] as Record<string, unknown>).messageTag, platform).toBeUndefined();
    }
  });
});

describe("when ManyChat refuses the send", () => {
  it("shows ManyChat's own reason, saves nothing, and links to the chat in ManyChat", async () => {
    sendSpy.mockRejectedValue(
      new Error('ManyChat send failed: 400 {"status":"error","message":"Unsupported message tag"} (attempt 1/3)')
    );
    const { status, body } = await postReply();
    expect(status).toBe(502);
    expect(body.error).toContain("Instagram");
    expect(body.error).toContain("ManyChat said: Unsupported message tag");
    expect(body.error).not.toContain("attempt");
    expect(hasUnicodeDash(String(body.error))).toBe(false);
    expect(body.manychatUrl).toBe(LIVE_CHAT_URL);
    // Not delivered, so no phantom "You" bubble.
    expect(inserts).toEqual([]);
  });

  it("past the 24h window, says so and points to ManyChat's Inbox (7 days there)", async () => {
    lastInbound = { created_at: new Date(NOW - 30 * HOUR).toISOString() };
    sendSpy.mockRejectedValue(
      new Error(
        'ManyChat send failed: 400 {"status":"error","message":"Content can\'t be sent to subscriber without message tag. Subscriber\'s last interaction was over 24h ago."} (attempt 1/3)'
      )
    );
    const { status, body } = await postReply();
    expect(status).toBe(502);
    expect(body.error).toMatch(/more than 24 hours/);
    expect(body.error).toMatch(/ManyChat's Inbox/);
    expect(body.error).toMatch(/7 days/);
    expect(hasUnicodeDash(String(body.error))).toBe(false);
    expect(body.manychatUrl).toBe(LIVE_CHAT_URL);
  });

  it("a network failure (no word from ManyChat) keeps the plain try-again message", async () => {
    sendSpy.mockRejectedValue(new Error("ManyChat send failed: fetch failed (attempt 3/3)"));
    const { status, body } = await postReply();
    expect(status).toBe(502);
    expect(body.error).toBe("Couldn't deliver the message to Instagram. Please try again.");
  });
});

// ---------------------------------------------------------------------------
// Pure helpers.
// ---------------------------------------------------------------------------

describe("manychatFailureReason", () => {
  const reason = (msg: unknown) => mc.manychatFailureReason(msg);

  it("reads a 200 refusal", () => {
    expect(reason(new Error("ManyChat send refused (HTTP 200): Subscriber has blocked the page (attempt 1/3)"))).toBe(
      "Subscriber has blocked the page"
    );
  });

  it("reads a 4xx JSON body, adding the first detail", () => {
    const r = reason(
      new Error(
        'ManyChat send failed: 400 {"status":"error","message":"Validation error","details":{"messages":[{"message":"Message tags are no longer supported"}]}} (attempt 1/3)'
      )
    );
    expect(r).toBe("Validation error: Message tags are no longer supported");
  });

  it("keeps a plain-text body", () => {
    expect(reason(new Error("ManyChat send failed: 403 Forbidden (attempt 1/3)"))).toBe("Forbidden");
  });

  it("returns null when ManyChat said nothing (network error, empty 5xx, non-errors)", () => {
    expect(reason(new Error("ManyChat send failed: fetch failed (attempt 3/3)"))).toBeNull();
    expect(reason(new Error("ManyChat send failed: 503  (attempt 3/3)"))).toBeNull();
    expect(reason(new Error("ManyChat send failed: no attempts made"))).toBeNull();
    expect(reason("boom")).toBeNull();
    expect(reason(undefined)).toBeNull();
  });

  it("never shows a dash the UI rules forbid, and stays short", () => {
    const dashed = reason(new Error("ManyChat send refused (HTTP 200): Window closed — try later (attempt 1/3)"));
    expect(dashed).not.toBeNull();
    expect(hasUnicodeDash(dashed!)).toBe(false);
    const long = reason(new Error(`ManyChat send refused (HTTP 200): ${"x".repeat(900)} (attempt 1/3)`));
    expect(long!.length).toBeLessThanOrEqual(200);
  });
});

describe("manualReplyWindowClosed", () => {
  const closed = (platform: Parameters<typeof mw.manualReplyWindowClosed>[0], ago: number | null) =>
    mw.manualReplyWindowClosed(platform, ago == null ? null : NOW - ago, NOW);

  it("is open inside the channel's standard window", () => {
    expect(closed("instagram", 2 * MIN)).toBe(false);
    expect(closed("messenger", 23 * HOUR)).toBe(false);
  });

  it("is closed past it", () => {
    expect(closed("instagram", 30 * HOUR)).toBe(true);
    expect(closed("whatsapp", 25 * HOUR)).toBe(true);
  });

  it("is never claimed closed when we can't know (no inbound on record, or no window)", () => {
    expect(closed("instagram", null)).toBe(false);
    expect(closed("telegram", 30 * DAY)).toBe(false);
  });
});

describe("manualReplyFailureMessage", () => {
  it("has no unicode dashes in any variant", () => {
    for (const platform of ["instagram", "messenger", "whatsapp"] as const) {
      for (const windowClosed of [true, false]) {
        for (const r of [null, "Unsupported message tag"]) {
          const msg = mw.manualReplyFailureMessage({ platform, reason: r, windowClosed });
          expect(hasUnicodeDash(msg), msg).toBe(false);
        }
      }
    }
  });

  it("never hides an unrelated ManyChat reason behind the window explanation", () => {
    // A revoked key (or a bad subscriber) failing while our clock says >24h: the owner
    // must see the fixable cause, with the window only as extra context.
    const msg = mw.manualReplyFailureMessage({
      platform: "instagram",
      reason: "Invalid access token",
      windowClosed: true,
    });
    expect(msg).toContain("ManyChat said: Invalid access token.");
    expect(msg).toMatch(/more than 24 hours/);
    expect(msg).toMatch(/ManyChat's Inbox/);
  });

  it("a window/tag refusal (or no reason) gets the plain window explanation", () => {
    for (const reason of [
      null,
      "Content can't be sent to subscriber without message tag. Subscriber's last interaction was over 24h ago.",
      "This message is sent outside of allowed window.",
    ]) {
      const msg = mw.manualReplyFailureMessage({ platform: "instagram", reason, windowClosed: true });
      expect(msg, String(reason)).toMatch(/^Instagram didn't accept this message because/);
      expect(msg).not.toContain("ManyChat said");
    }
  });

  it("only promises the ManyChat Inbox's 7 days where that exists (IG/Messenger)", () => {
    expect(mw.manualReplyFailureMessage({ platform: "instagram", reason: null, windowClosed: true })).toMatch(/7 days/);
    expect(mw.manualReplyFailureMessage({ platform: "whatsapp", reason: null, windowClosed: true })).not.toMatch(/7 days/);
  });
});

describe("no API send is tagged HUMAN_AGENT", () => {
  it("the reply route passes no messageTag", () => {
    const src = code("app/api/conversations/[id]/reply/route.ts");
    expect(src).not.toMatch(/HUMAN_AGENT/);
    expect(src).not.toMatch(/supportsHumanAgentTag/);
    for (const args of callArgs(src, "sendManychatMessage")) {
      expect(args).not.toMatch(/messageTag/);
    }
  });

  it("the push-reconcile cron retries untagged, inside the standard window only", () => {
    const src = code("app/api/cron/reconcile-pushes/route.ts");
    expect(src).not.toMatch(/messageTag/);
    expect("retryMessageTag" in mw).toBe(false);
    // A retried reply is an API send like any other: 24h, whoever wrote it.
    expect(mw.retryStillDeliverable("instagram", NOW - 23 * HOUR, NOW)).toBe(true);
    expect(mw.retryStillDeliverable("instagram", NOW - 30 * HOUR, NOW)).toBe(false);
    expect(mw.retryStillDeliverable("instagram", null, NOW)).toBe(false);
    expect(mw.retryStillDeliverable("telegram", NOW - 30 * DAY, NOW)).toBe(true);
  });

  it("the composer shows the ManyChat link the route returns", () => {
    const src = code("components/dashboard/conversation-reply-box.tsx");
    expect(src).toMatch(/manychatUrl/);
    expect(src).toMatch(/target="_blank"/);
    expect(src).toMatch(/rel="noopener noreferrer"/);
  });
});
