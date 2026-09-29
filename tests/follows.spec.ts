import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { hasUnicodeDash } from "@/lib/sanitize";
import { code, read, callArgs, sourceFiles } from "./helpers/source";
import {
  FOLLOW_EVENT,
  FOLLOWERS_ANCHOR,
  MAX_CHART_BARS,
  QUIET_AFTER_DAYS,
  isFollowEvent,
  buildFollowRow,
  recordFollow,
  parseFollowReport,
  getFollowReport,
  followCoverage,
  bucketFollowSeries,
  followSetupHref,
  followScope,
  followSetupLinks,
  followCardVisible,
  followSkeleton,
  followPause,
  probeFollowTracking,
  type FollowReport,
  type ScopeBot,
} from "@/lib/follows";
import {
  FOLLOW_SETUP_HIDDEN_COOKIE,
  FOLLOW_SETUP_HIDDEN_MAX,
  followSetupHiddenCookie,
  followSetupHiddenFor,
  readFollowSetupHidden,
  withFollowSetupHidden,
} from "@/lib/follow-setup-cookie";

/**
 * New Instagram followers (Statistics > "New Instagram followers").
 *
 * Instagram's public API has no follower list and no follow event, so the only
 * per-person source is ManyChat's Follow to DM trigger (the "Say hi to new
 * followers" automation). An External Request step in that automation posts
 * {"event": "new_follower", "contact": <Full Contact Data>} to the ManyChat webhook,
 * which records one row per follower in instagram_follows and answers with NO
 * message.
 *
 * The rules pinned here:
 *  - a follow is recorded once per follower and never creates a conversation, a
 *    message, a reply or a ManyChat send; it is handled just after the billing gate
 *    (a lapsed plan records nothing, like a DM) and before every DM step;
 *  - follows have their own flood-cap bucket (a leaked secret can't write
 *    unbounded rows; real follows never spend the DM budget);
 *  - a mistyped or missing "event" never opens an empty lead thread;
 *  - the Statistics report is the EFFECTIVE user's (View as client), like every
 *    other analytics call, and never compares against a half-tracked period;
 *  - owners and superadmins can read the rows, and only the webhook writes them.
 */

const WEBHOOK = "app/api/webhooks/manychat/route.ts";
const MIGRATION = "supabase/migrations/2026-09-29-instagram-follows.sql";
const CARD = "components/dashboard/stats/new-followers-card.tsx";
const HIDE_BUTTON = "components/dashboard/stats/hide-follow-setup-button.tsx";
const TAB_PANEL = "components/dashboard/chatbot-tab-panel.tsx";
const STATS_PAGE = "app/(dashboard)/statistics/page.tsx";

const SECRET = "whsec-test-secret";
const BOT_ID = "0b9f7a52-2c1e-4a44-9d6c-8a3b1d2e4f60";

// ---------------------------------------------------------------------------
// Route harness: the real webhook over a tiny recording Supabase stand-in.
// ---------------------------------------------------------------------------

let subscription: Record<string, unknown> | null;
let followResult: { data: unknown; error: unknown };
/** The conversation the step-4 lookup finds (null: a contact we have never seen). */
let existingConversation: Record<string, unknown> | null;
/** The error the step-4 lookup fails with (null: the read succeeds). */
let conversationLookupError: unknown;
let touched: string[];
/** Every write; an update also carries the `.eq` filters it was keyed by. */
let writes: { table: string; row: unknown; opts: unknown; eqs?: [string, unknown][] }[];

const sends = {
  message: vi.fn(),
  paced: vi.fn(),
  media: vi.fn(),
  flow: vi.fn(),
};
const limits = {
  botInbound: vi.fn(),
  duplicate: vi.fn(),
};

function table(name: string) {
  touched.push(name);
  const chain: Record<string, unknown> = {};
  const eqs: [string, unknown][] = [];
  for (const m of ["select", "eq", "neq", "in", "is", "gte", "lt", "order", "limit", "abortSignal", "update"]) {
    chain[m] = () => chain;
  }
  chain.eq = (col: string, val: unknown) => {
    eqs.push([col, val]);
    return chain;
  };
  const result = () => {
    if (name === "chatbots") {
      return {
        data: { id: BOT_ID, user_id: "owner-1", webhook_secret: SECRET, is_active: true },
        error: null,
      };
    }
    if (name === "subscriptions") return { data: subscription, error: null };
    if (name === "instagram_follows") return followResult;
    if (name === "conversations") return { data: existingConversation, error: null };
    return { data: null, error: null };
  };
  // Only the step-4 lookup reads a conversation with maybeSingle before 4-empty.
  chain.maybeSingle = async () =>
    name === "conversations" && conversationLookupError
      ? { data: null, error: conversationLookupError }
      : result();
  chain.single = async () => result();
  chain.upsert = (row: unknown, opts: unknown) => {
    writes.push({ table: name, row, opts });
    return chain;
  };
  chain.update = (row: unknown) => {
    writes.push({ table: name, row, opts: "update", eqs });
    return chain;
  };
  chain.insert = (row: unknown) => {
    writes.push({ table: name, row, opts: "insert" });
    return chain;
  };
  // `await supabase.from(t).upsert(...).select(...)` resolves the chain itself.
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result()).then(resolve, reject);
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ from: (t: string) => table(t) }),
  createClient: async () => ({ from: (t: string) => table(t) }),
  getCurrentUser: async () => null,
}));

vi.mock("@/lib/manychat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/manychat")>()),
  sendManychatMessage: (...a: unknown[]) => sends.message(...a),
  sendManychatSequencePaced: (...a: unknown[]) => sends.paced(...a),
  sendManychatMedia: (...a: unknown[]) => sends.media(...a),
  sendManychatFlow: (...a: unknown[]) => sends.flow(...a),
}));

// Both limiters answer from the spies (never Redis): beforeEach makes the flood cap
// pass, and a test can make it trip with mockResolvedValueOnce.
vi.mock("@/lib/limits", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/limits")>();
  return {
    ...real,
    checkChatbotInboundLimit: (...a: unknown[]) => limits.botInbound(...a),
    checkDuplicate: (...a: unknown[]) => limits.duplicate(...a),
  };
});

// The webhook imports most of lib/, so the first import can take seconds on a cold
// transform cache. Do it once, up front, with room to spare: paying for it inside
// the first test can time that test out while its request keeps running and
// writes into the next test's recorders.
let POST: (typeof import("@/app/api/webhooks/manychat/route"))["POST"];
beforeAll(async () => {
  ({ POST } = await import("@/app/api/webhooks/manychat/route"));
}, 120_000);

async function post(body: unknown, secret = SECRET) {
  const res = await POST(
    new NextRequest("http://localhost/api/webhooks/manychat", {
      method: "POST",
      headers: { "content-type": "application/json", "x-manychat-secret": secret },
      body: JSON.stringify(body),
    })
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/** What ManyChat sends from the new-follower automation: routing fields + Full Contact Data. */
function followBody(extra: Record<string, unknown> = {}) {
  return {
    chatbot_id: BOT_ID,
    platform: "instagram",
    event: FOLLOW_EVENT,
    contact: {
      id: "1842539971",
      ig_username: "maria.fit",
      first_name: "Maria",
      last_name: "Lopez",
      // Full Contact Data always carries the contact's last typed text. For a
      // follow it must never be treated as a message.
      last_input_text: "how much is coaching?",
      live_chat_url: "https://app.manychat.com/fb1/chat/1842539971",
    },
    ...extra,
  };
}

/** Writes that would open a thread or store a message. */
const threadWrites = () => writes.filter((w) => w.table === "conversations" || w.table === "messages");

beforeEach(() => {
  vi.stubEnv("MANYCHAT_WEBHOOK_SECRET", "");
  subscription = { status: "active", comp_expires_at: null };
  followResult = { data: [{ id: "f1" }], error: null };
  existingConversation = null;
  conversationLookupError = null;
  touched = [];
  writes = [];
  for (const s of [...Object.values(sends), ...Object.values(limits)]) s.mockReset();
  limits.botInbound.mockResolvedValue({ ok: true, limit: 600, remaining: 599, bypassed: false });
  limits.duplicate.mockResolvedValue({ isDuplicate: false });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("webhook: a new-follower event", () => {
  it("records the follower once and answers with no message", async () => {
    const { status, body } = await post(followBody());
    expect(status).toBe(200);
    expect(body.content).toEqual({ messages: [] });
    expect(body.reply).toBe("");
    expect(body.ai_skipped).toBe(true);
    expect(body.reason).toBe("follow_recorded");
    expect(writes).toEqual([
      {
        table: "instagram_follows",
        row: {
          chatbot_id: BOT_ID,
          manychat_subscriber_id: "1842539971",
          // The identity a DM from this person stores (resolveExternalId: the @handle).
          external_user_id: "maria.fit",
          username: "maria.fit",
          display_name: "Maria Lopez",
        },
        opts: { onConflict: "chatbot_id,manychat_subscriber_id", ignoreDuplicates: true },
      },
    ]);
  });

  it("never opens a thread, stores a message, sends anything, or reaches the DM gates", async () => {
    await post(followBody());
    // The auth read, the billing read and the follow write. No conversation, no
    // message, no usage row.
    expect(touched).toEqual(["chatbots", "subscriptions", "instagram_follows"]);
    for (const s of Object.values(sends)) expect(s).not.toHaveBeenCalled();
    expect(limits.duplicate).not.toHaveBeenCalled();
  });

  it("uses its own flood-cap bucket, never the DM one", async () => {
    await post(followBody());
    expect(limits.botInbound).toHaveBeenCalledTimes(1);
    expect(limits.botInbound).toHaveBeenCalledWith(`${BOT_ID}:follow`);
  });

  it("a tripped follow cap records nothing and still answers with no message", async () => {
    limits.botInbound.mockResolvedValueOnce({ ok: false, limit: 600, remaining: 0, bypassed: false });
    const { status, body } = await post(followBody());
    expect(status).toBe(200);
    expect(body.reason).toBe("follow_rate_limited");
    expect(body.content).toEqual({ messages: [] });
    expect(writes).toEqual([]);
  });

  it("a lapsed plan records nothing, like a DM, and gets no text back", async () => {
    subscription = { status: "canceled", comp_expires_at: null };
    const { status, body } = await post(followBody());
    expect(status).toBe(200);
    expect(body.reason).toBe("subscription_inactive");
    expect(body.reply).toBe("");
    expect(body.content).toEqual({ messages: [] });
    expect(writes).toEqual([]);
    expect(touched).not.toContain("instagram_follows");
  });

  it("a follower ManyChat reports twice is kept once", async () => {
    followResult = { data: [], error: null }; // ON CONFLICT DO NOTHING returned no row
    const { status, body } = await post(followBody());
    expect(status).toBe(200);
    expect(body.reason).toBe("follow_already_recorded");
    expect(body.content).toEqual({ messages: [] });
  });

  it("before the migration (no table) it still answers 200 with no message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    followResult = {
      data: null,
      error: { code: "PGRST205", message: "Could not find the table 'public.instagram_follows' in the schema cache" },
    };
    const { status, body } = await post(followBody());
    expect(status).toBe(200);
    expect(body.reason).toBe("follow_not_recorded");
    expect(body.content).toEqual({ messages: [] });
  });

  it("a wrong secret is refused exactly like any other request, and nothing is written", async () => {
    const { status, body } = await post(followBody(), "not-the-secret");
    expect(status).toBe(401);
    expect(body).toEqual({ error: "unauthorized" });
    expect(writes).toEqual([]);
  });

  it("only Instagram follows are recorded; another channel is acknowledged and ignored", async () => {
    const { status, body } = await post(followBody({ platform: "messenger" }));
    expect(status).toBe(200);
    expect(body.reason).toBe("follow_not_instagram");
    expect(body.content).toEqual({ messages: [] });
    expect(writes).toEqual([]);
  });

  it("a flat body (no Full Contact Data) works too, and unresolved {{fields}} are not stored", async () => {
    const { body } = await post({
      chatbot_id: BOT_ID,
      event: "New Follower",
      subscriber_id: 77,
      username: "{{ig_username}}",
      first_name: "Sam",
    });
    expect(body.reason).toBe("follow_recorded");
    expect(writes[0].row).toEqual({
      chatbot_id: BOT_ID,
      manychat_subscriber_id: "77",
      external_user_id: null,
      username: null,
      display_name: "Sam",
    });
  });

  it("the ways an owner might type the event all count", async () => {
    for (const event of ["newFollower", "new.follower", "New Followers", "follow"]) {
      writes = [];
      const { body } = await post(followBody({ event }));
      expect(body.reason, event).toBe("follow_recorded");
      expect(writes, event).toHaveLength(1);
    }
  });

  it("an unwired contact id records nothing and still answers with no message", async () => {
    const { status, body } = await post({ chatbot_id: BOT_ID, event: FOLLOW_EVENT, subscriber_id: "{{user_id}}" });
    expect(status).toBe(200);
    expect(body.reason).toBe("follow_no_contact_id");
    expect(body.content).toEqual({ messages: [] });
    expect(writes).toEqual([]);
  });

  it("a body with no contact id at all is a bad request, like any request without one", async () => {
    const { status, body } = await post({ chatbot_id: BOT_ID, platform: "instagram", event: FOLLOW_EVENT });
    expect(status).toBe(400);
    expect(body.error).toBe("bad_request");
    expect(writes).toEqual([]);
  });
});

describe("webhook: an event it doesn't recognise never opens an empty lead thread", () => {
  /** A new follower's Full Contact Data: no text typed yet. */
  const freshContact = { id: "90210", ig_username: "new.fan", first_name: "New", last_input_text: null };

  it("a mistyped event is acknowledged and creates nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { status, body } = await post({ chatbot_id: BOT_ID, platform: "instagram", event: "new_folower", contact: freshContact });
    expect(status).toBe(200);
    expect(body.reason).toBe("unknown_event");
    expect(body.content).toEqual({ messages: [] });
    expect(threadWrites()).toEqual([]);
    for (const s of Object.values(sends)) expect(s).not.toHaveBeenCalled();
  });

  it("the DM body pasted without the event line creates nothing either", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { status, body } = await post({ chatbot_id: BOT_ID, platform: "instagram", contact: freshContact });
    expect(status).toBe(200);
    expect(body.reason).toBe("empty_message");
    expect(threadWrites()).toEqual([]);
  });

  it("a control request that sets something still creates the row it needs", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // BOT_OFF added, BOT_ON added (it stamps bot_forced_on_at, which the keyword
    // gate reads), a Recurring Notifications opt-in: each needs the row.
    for (const flag of [{ bot_off: true }, { bot_on: true }, { rn_opt_in: "1" }, { bot_on: "true" }]) {
      writes = [];
      await post({ chatbot_id: BOT_ID, subscriber_id: "31337", ...flag });
      expect(
        writes.some((w) => w.table === "conversations" && w.opts !== "update"),
        JSON.stringify(flag)
      ).toBe(true);
    }
  });

  it("a BOT_OFF removal for someone never seen has nothing to clear and creates nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const bot_off of [false, "false", "0", ""]) {
      writes = [];
      const { body } = await post({ chatbot_id: BOT_ID, subscriber_id: "31337", bot_off });
      expect(body.reason, JSON.stringify(bot_off)).toBe("empty_message");
      expect(threadWrites(), JSON.stringify(bot_off)).toEqual([]);
    }
  });

  it("a BOT_OFF removal still clears the flag when the contact lookup fails, and rewrites nothing else", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    // A pool timeout on the step-4 read leaves the contact unknown, exactly like
    // someone never seen, and ManyChat never sends the tag removal again.
    conversationLookupError = { code: "PGRST003", message: "Timed out acquiring connection from connection pool." };
    for (const bot_off of [false, "false", "0"]) {
      writes = [];
      const { status, body } = await post({ chatbot_id: BOT_ID, subscriber_id: "5", bot_off });
      expect(status).toBe(200);
      expect(body.reason, JSON.stringify(bot_off)).toBe("bot_off_cleared");
      // One write keyed by the contact: it clears a known contact's flag and touches
      // no row for someone never seen. Never the upsert, which would blank a known
      // contact's name and ids from this nameless body.
      expect(threadWrites(), JSON.stringify(bot_off)).toEqual([
        {
          table: "conversations",
          row: { bot_off_at: null },
          opts: "update",
          eqs: [
            ["chatbot_id", BOT_ID],
            ["manychat_subscriber_id", "5"],
          ],
        },
      ]);
    }
    expect(errors).toHaveBeenCalledWith("[manychat-webhook] conversation lookup failed", conversationLookupError);
    // A request with nothing to clear still creates nothing when the read fails.
    writes = [];
    const { body } = await post({ chatbot_id: BOT_ID, subscriber_id: "5" });
    expect(body.reason).toBe("empty_message");
    expect(threadWrites()).toEqual([]);
  });

  it("a new contact's media-only first DM still opens the thread", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await post({ chatbot_id: BOT_ID, subscriber_id: "31338", attachment_url: "https://cdn.example.com/photo.jpg" });
    expect(writes.some((w) => w.table === "conversations" && w.opts !== "update")).toBe(true);
  });

  it("a known contact's empty request keeps its old path: the thread is touched, nothing is created", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    existingConversation = {
      id: "conv-1",
      status: "active",
      user_muted_at: null,
      unread_count: 0,
      contact_name: null,
      contact_username: null,
      external_user_id: null,
    };
    const { body } = await post({ chatbot_id: BOT_ID, subscriber_id: "5" });
    expect(body.reason).toBe("empty_message");
    expect(writes.some((w) => w.table === "conversations" && w.opts === "update")).toBe(true);
    expect(writes.some((w) => w.table === "conversations" && w.opts !== "update")).toBe(false);
  });
});

describe("webhook: a follower and their later thread carry the same identity", () => {
  it("the DM path stores the external_user_id the follow row stores", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await post(followBody());
    const followed = writes.find((w) => w.table === "instagram_follows")!.row as Record<string, unknown>;
    writes = [];
    // The same person's first DM, sent with the same Full Contact Data.
    await post({ chatbot_id: BOT_ID, platform: "instagram", contact: followBody().contact });
    const thread = writes.find((w) => w.table === "conversations" && w.opts !== "update")!.row as Record<string, unknown>;
    expect(followed.external_user_id).toBe("maria.fit");
    expect(thread.external_user_id).toBe(followed.external_user_id);
  });
});

describe("webhook: everything that is not a follow takes the normal path", () => {
  it("a DM (no event) is not swallowed: it reaches the billing gate as before", async () => {
    subscription = null;
    const { body } = await post({ chatbot_id: BOT_ID, subscriber_id: "5", message: "hi" });
    expect(body.reason).toBe("subscription_inactive");
    expect(body.reply).not.toBe("");
    expect(writes).toEqual([]);
    expect(touched).toContain("subscriptions");
  });

  it("an unrelated event value is a normal request too", async () => {
    subscription = null;
    const { body } = await post({ chatbot_id: BOT_ID, subscriber_id: "5", message: "hi", event: "message" });
    expect(body.reason).toBe("subscription_inactive");
    expect(writes).toEqual([]);
  });

  it("an `event` that isn't text (an object, an array) never 400s a real message", async () => {
    subscription = null;
    for (const event of [{ type: "x" }, ["a"]]) {
      const { status, body } = await post({ chatbot_id: BOT_ID, subscriber_id: "5", message: "hi", event });
      expect(status, JSON.stringify(event)).toBe(200);
      expect(body.reason).toBe("subscription_inactive");
    }
  });
});

describe("webhook source: where the follow branch sits", () => {
  // The POST handler only: helpers above it (persistAndPush, the deep-link stamp)
  // also touch conversations and messages, but they run only when POST calls them.
  const live = code(WEBHOOK);
  const handlerAt = live.indexOf("export async function POST(");
  const handler = live.slice(handlerAt);
  const at = (needle: string) => {
    const i = handler.indexOf(needle);
    expect(i, `${needle} not found in the webhook's POST handler`).toBeGreaterThan(-1);
    return i;
  };

  it("the event is read once, after the secret check", () => {
    expect(handlerAt).toBeGreaterThan(-1);
    expect(live.match(/isFollowEvent\(/g) ?? []).toHaveLength(1);
    const decl = at("const followEvent = isFollowEvent(body.event)");
    expect(handler.lastIndexOf("if (!secretOk)", decl)).toBeGreaterThan(-1);
    expect(handler.indexOf("if (!secretOk)", decl)).toBe(-1);
  });

  it("recorded after the billing gate and before every DM step", () => {
    const gate = at('.from("subscriptions")');
    const build = at("buildFollowRow(");
    const record = at("recordFollow(");
    expect(live.match(/buildFollowRow\(/g) ?? []).toHaveLength(1);
    expect(live.match(/recordFollow\(/g) ?? []).toHaveLength(1);
    expect(gate).toBeLessThan(build);
    for (const later of [
      "checkChatbotInboundLimit(chatbot.id)",
      "resolveManychatApiKey(chatbot)",
      "checkDuplicate(",
      '.from("conversations")',
      '.from("messages")',
    ]) {
      expect(record, `the follow branch must come before ${later}`).toBeLessThan(at(later));
    }
  });

  it("its own flood-cap bucket sits between building the row and writing it", () => {
    const cap = at("checkChatbotInboundLimit(`${chatbot.id}:follow`)");
    expect(at("buildFollowRow(")).toBeLessThan(cap);
    expect(cap).toBeLessThan(at("recordFollow("));
  });

  it("answers with an empty reply, including a lapsed plan's follow", () => {
    const branchStart = handler.lastIndexOf("if (followEvent)", at("buildFollowRow("));
    const branch = handler.slice(branchStart, at("checkChatbotInboundLimit(chatbot.id)"));
    expect(branch).toMatch(/manychatReply\(""/);
    expect(branch).not.toMatch(/manychatReply\(\s*"[^"]/);
    const gate = handler.slice(at("if (!hasActiveAccess(subscription))"), branchStart);
    expect(gate).toMatch(/if \(followEvent\) \{\s*return manychatReply\("", \{ ai_skipped: true, reason: "subscription_inactive" \}\);/);
  });

  it("a new contact with nothing to act on returns before the conversation upsert", () => {
    const empty = handler.search(/!existing &&\s+!baseText &&\s+!hasMedia &&/);
    expect(empty, "the 4-empty check").toBeGreaterThan(-1);
    expect(at('.eq("manychat_subscriber_id", body.subscriber_id)')).toBeLessThan(empty);
    expect(empty).toBeLessThan(at(".upsert("));
  });
});

// ---------------------------------------------------------------------------
// Pure helpers.
// ---------------------------------------------------------------------------

describe("isFollowEvent", () => {
  it("accepts the value the Connection tab tells owners to paste, and the ways it gets mistyped", () => {
    expect(FOLLOW_EVENT).toBe("new_follower");
    for (const v of [
      "new_follower",
      "New Follower",
      "new-follower",
      "  NEW_FOLLOWER ",
      "new  follower",
      "newFollower",
      "new.follower",
      "new_followers",
      "follower",
      "follow",
      "followed",
    ]) {
      expect(isFollowEvent(v), v).toBe(true);
    }
  });

  it("rejects everything else", () => {
    for (const v of [undefined, null, "", "   ", "message", "unfollow", "follow_up", "new_folower", "1", 1, true, {}]) {
      expect(isFollowEvent(v), String(v)).toBe(false);
    }
  });
});

describe("buildFollowRow", () => {
  it("joins the name, keeps the handle and the identity, and trims", () => {
    expect(
      buildFollowRow({
        chatbotId: "b1",
        subscriberId: " 42 ",
        externalUserId: "maria.fit",
        username: " maria.fit ",
        firstName: "Maria",
        lastName: " Lopez ",
      })
    ).toEqual({
      chatbot_id: "b1",
      manychat_subscriber_id: "42",
      external_user_id: "maria.fit",
      username: "maria.fit",
      display_name: "Maria Lopez",
    });
  });

  it("stores null, never a {{placeholder}} or an empty string", () => {
    expect(
      buildFollowRow({
        chatbotId: "b1",
        subscriberId: "42",
        externalUserId: "{{ig_id}}",
        username: "{{ig_username}}",
        firstName: "",
        lastName: "{{last_name}}",
      })
    ).toEqual({ chatbot_id: "b1", manychat_subscriber_id: "42", external_user_id: null, username: null, display_name: null });
  });

  it("caps oversized names, and drops an identity too long to be real rather than cut it", () => {
    const row = buildFollowRow({
      chatbotId: "b1",
      subscriberId: "42",
      externalUserId: "x".repeat(900),
      username: "u".repeat(900),
      firstName: "n".repeat(900),
    });
    expect(row!.username!.length).toBeLessThanOrEqual(200);
    expect(row!.display_name!.length).toBeLessThanOrEqual(200);
    expect(row!.external_user_id).toBeNull();
  });

  it("no usable contact id means no row (every follower would collide on it)", () => {
    for (const id of ["", "   ", "{{user_id}}", "9".repeat(101)]) {
      expect(buildFollowRow({ chatbotId: "b1", subscriberId: id, username: "maria.fit" }), JSON.stringify(id)).toBeNull();
    }
  });
});

function writer(result: { data: unknown; error: unknown }) {
  const calls: { table: string; row: unknown; opts: unknown; select?: string }[] = [];
  const client = {
    from(t: string) {
      return {
        upsert(row: unknown, opts: unknown) {
          const call: { table: string; row: unknown; opts: unknown; select?: string } = { table: t, row, opts };
          calls.push(call);
          const b = {
            select(cols: string) {
              call.select = cols;
              return b;
            },
            abortSignal() {
              return b;
            },
            then(ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) {
              return Promise.resolve(result).then(ok, bad);
            },
          };
          return b;
        },
      };
    },
  };
  return { client: client as unknown as Parameters<typeof recordFollow>[0], calls };
}

describe("recordFollow", () => {
  const row = {
    chatbot_id: "b1",
    manychat_subscriber_id: "42",
    external_user_id: "maria.fit",
    username: "maria.fit",
    display_name: "Maria",
  };

  it("inserts once per (bot, contact) and reports a new follower", async () => {
    const { client, calls } = writer({ data: [{ id: "f1" }], error: null });
    expect(await recordFollow(client, row)).toBe("follow_recorded");
    expect(calls).toEqual([
      {
        table: "instagram_follows",
        row,
        opts: { onConflict: "chatbot_id,manychat_subscriber_id", ignoreDuplicates: true },
        select: "id",
      },
    ]);
  });

  it("an existing follower comes back as already recorded", async () => {
    const { client } = writer({ data: [], error: null });
    expect(await recordFollow(client, row)).toBe("follow_already_recorded");
  });

  it("a database error is reported, never thrown", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = writer({ data: null, error: { code: "42P01", message: "relation does not exist" } });
    await expect(recordFollow(client, row)).resolves.toBe("follow_not_recorded");
  });
});

describe("parseFollowReport", () => {
  it("normalises the RPC's jsonb", () => {
    expect(
      parseFollowReport({
        tracking: true,
        tracked_bots: [
          { id: "bot-1", first_followed_at: "2026-09-01T08:00:00+00:00", last_followed_at: "2026-09-28T10:00:00+00:00" },
          { id: "", first_followed_at: "2026-09-02T08:00:00+00:00", last_followed_at: "2026-09-03T08:00:00+00:00" },
          { id: "bot-2", first_followed_at: "not a date", last_followed_at: "2026-09-03T08:00:00+00:00" },
          "bot-3",
          7,
        ],
        first_followed_at: "2026-09-01T08:00:00+00:00",
        last_followed_at: "2026-09-28T10:00:00+00:00",
        follows: "12",
        prev_follows: 8,
        messaged: 3,
        series: [{ day: "2026-09-28", follows: "5" }],
        latest: [
          {
            username: "maria.fit",
            display_name: "Maria",
            followed_at: "2026-09-28T10:00:00+00:00",
            conversation_id: "c1",
            messaged: true,
          },
        ],
      })
    ).toEqual({
      tracking: true,
      trackedBots: [
        { id: "bot-1", firstFollowedAt: "2026-09-01T08:00:00+00:00", lastFollowedAt: "2026-09-28T10:00:00+00:00" },
      ],
      firstFollowedAt: "2026-09-01T08:00:00+00:00",
      lastFollowedAt: "2026-09-28T10:00:00+00:00",
      follows: 12,
      prevFollows: 8,
      messaged: 3,
      series: [{ day: "2026-09-28", follows: 5 }],
      latest: [
        {
          username: "maria.fit",
          display_name: "Maria",
          followed_at: "2026-09-28T10:00:00+00:00",
          conversation_id: "c1",
          messaged: true,
        },
      ],
    });
  });

  it("fills gaps with safe defaults and keeps a missing previous period as null", () => {
    expect(parseFollowReport({ tracking: false })).toEqual({
      tracking: false,
      trackedBots: [],
      firstFollowedAt: null,
      lastFollowedAt: null,
      follows: 0,
      prevFollows: null,
      messaged: 0,
      series: [],
      latest: [],
    });
  });

  it("a timestamp it can't read is absent, not a wrong date", () => {
    const r = parseFollowReport({ tracking: true, first_followed_at: "not a date", last_followed_at: 5 });
    expect(r!.firstFollowedAt).toBeNull();
    expect(r!.lastFollowedAt).toBeNull();
  });

  it("rejects what is not a report", () => {
    for (const v of [null, undefined, "x", 3, []]) expect(parseFollowReport(v)).toBeNull();
  });
});

describe("getFollowReport: the report is the effective user's", () => {
  function rpcClient(result: { data: unknown; error: unknown }) {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const client = {
      rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        return result;
      }),
    };
    return { client: client as unknown as Parameters<typeof getFollowReport>[0], calls };
  }

  it("sends p_user_id with the range, the previous period and the bot scope", async () => {
    const { client, calls } = rpcClient({ data: { tracking: true, follows: 1 }, error: null });
    const out = await getFollowReport(client, {
      from: "2026-08-30T00:00:00.000Z",
      to: "2026-09-29T00:00:00.000Z",
      prevFrom: "2026-07-31T00:00:00.000Z",
      chatbotId: "bot-1",
      userId: "user-1",
    });
    expect(calls).toEqual([
      {
        name: "instagram_follow_report",
        args: {
          p_from: "2026-08-30T00:00:00.000Z",
          p_to: "2026-09-29T00:00:00.000Z",
          p_prev_from: "2026-07-31T00:00:00.000Z",
          p_chatbot_id: "bot-1",
          p_user_id: "user-1",
          p_latest: 8,
        },
      },
    ]);
    expect(out.problem).toBeNull();
    expect(out.report?.follows).toBe(1);
  });

  it("a missing function reads as not installed, and nothing throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = rpcClient({ data: null, error: { code: "PGRST202" } });
    const out = await getFollowReport(client, {
      from: "a",
      to: "b",
      prevFrom: "c",
      chatbotId: null,
      userId: "user-1",
    });
    expect(out).toEqual({ report: null, problem: "not_installed" });
  });

  it("userId is required, forwarded as p_user_id, and every call site passes it", () => {
    const lib = code("lib/follows.ts");
    const sig = lib.slice(lib.indexOf("export async function getFollowReport("));
    const opts = sig.slice(0, sig.indexOf("): Promise<"));
    expect(opts).toMatch(/\buserId\s*:\s*string\b/);
    expect(opts).not.toMatch(/\buserId\s*\?\s*:/);
    expect(lib).toMatch(/p_user_id:\s*opts\.userId/);

    let total = 0;
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      if (file === "lib/follows.ts") continue;
      for (const args of callArgs(code(file), "getFollowReport")) {
        total++;
        if (!/\buserId\b/.test(args)) offenders.push(file);
      }
    }
    expect(total).toBeGreaterThanOrEqual(1);
    expect(offenders).toEqual([]);
  });
});

describe("followCoverage: never read an untracked stretch as real data", () => {
  const bot = (id: string, first: string, last: string) => ({ id, firstFollowedAt: first, lastFollowedAt: last });
  const report = (over: Partial<FollowReport>): FollowReport => ({
    tracking: true,
    trackedBots: [],
    firstFollowedAt: null,
    lastFollowedAt: null,
    follows: 0,
    prevFollows: 0,
    messaged: 0,
    series: [],
    latest: [],
    ...over,
  });
  // "Last 30 days" on Nov 10: [Oct 11, Nov 10), previous [Sep 11, Oct 11).
  const range = {
    prevFrom: "2026-09-11T00:00:00.000Z",
    from: "2026-10-11T00:00:00.000Z",
    to: "2026-11-10T00:00:00.000Z",
    rangeKey: "30d" as const,
  };
  const NOW = Date.parse("2026-11-10T00:00:00Z");

  it("compares against the previous period only when tracking covered all of it", () => {
    const full = followCoverage(
      report({ trackedBots: [bot("a", "2026-09-01T00:00:00Z", "2026-11-09T00:00:00Z")], follows: 90 }),
      range,
      NOW
    );
    expect(full).toEqual({
      previousComparable: true,
      lateBots: [],
      startedAfterRange: false,
      quiet: false,
      chartFillsIn: false,
    });
    // Set up on Oct 10: the previous period holds one tracked day, so "+2900%" would be a lie.
    const partial = followCoverage(
      report({ trackedBots: [bot("a", "2026-10-10T09:00:00Z", "2026-11-09T00:00:00Z")], follows: 90 }),
      range,
      NOW
    );
    expect(partial.previousComparable).toBe(false);
    expect(partial.lateBots).toEqual([]);
  });

  it("All chatbots: one bot tracked for long does not make a newer bot's half-tracked period fair", () => {
    // A since Aug 1, B since Oct 25: the range mixes a fully and a partly tracked bot.
    const a = bot("a", "2026-08-01T00:00:00Z", "2026-11-09T00:00:00Z");
    const b = bot("b", "2026-10-25T00:00:00Z", "2026-11-09T00:00:00Z");
    const c = followCoverage(report({ trackedBots: [a, b], follows: 94, prevFollows: 14 }), range, NOW);
    expect(c.previousComparable).toBe(false);
    expect(c.lateBots).toEqual([b]);
    expect(c.startedAfterRange).toBe(false);
  });

  it("names every bot whose first follow falls inside the range, and says when all began after it", () => {
    const inside = followCoverage(
      report({ trackedBots: [bot("a", "2026-10-20T00:00:00Z", "2026-11-01T00:00:00Z")], follows: 4 }),
      range,
      NOW
    );
    expect(inside).toMatchObject({ previousComparable: false, startedAfterRange: false });
    expect(inside.lateBots.map((x) => x.id)).toEqual(["a"]);
    const after = followCoverage(
      report({ trackedBots: [bot("a", "2026-11-15T00:00:00Z", "2026-11-20T00:00:00Z")] }),
      range,
      Date.parse("2026-11-21T00:00:00Z")
    );
    expect(after).toMatchObject({ lateBots: [], startedAfterRange: true, quiet: false });
  });

  it(`flags a feed that went quiet: nothing in the range and nothing for ${QUIET_AFTER_DAYS}+ days before it`, () => {
    const quiet = followCoverage(
      report({ trackedBots: [bot("a", "2026-08-01T00:00:00Z", "2026-10-02T00:00:00Z")] }),
      range,
      NOW
    );
    expect(quiet.quiet).toBe(true);
    // A past range with follows after it is an honest zero, not a dead feed.
    const later = followCoverage(
      report({ trackedBots: [bot("a", "2026-08-01T00:00:00Z", "2026-11-20T00:00:00Z")] }),
      range,
      Date.parse("2026-11-21T00:00:00Z")
    );
    expect(later.quiet).toBe(false);
  });

  it("a range that has only just begun, or starts later, never reads as a stopped feed", () => {
    const a = [bot("a", "2026-08-01T00:00:00Z", "2026-09-30T20:00:00Z")];
    // "This month" at 09:00 on Oct 1, the last follow 13 hours earlier.
    const month = {
      prevFrom: "2026-09-30T15:00:00.000Z",
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-01T09:00:00.000Z",
      rangeKey: "month" as const,
    };
    expect(followCoverage(report({ trackedBots: a }), month, Date.parse("2026-10-01T09:00:00Z")).quiet).toBe(false);
    // A custom range that starts after today.
    const future = {
      prevFrom: "2026-09-29T00:00:00.000Z",
      from: "2026-10-05T00:00:00.000Z",
      to: "2026-10-10T23:59:59.999Z",
      rangeKey: "custom" as const,
    };
    expect(followCoverage(report({ trackedBots: a }), future, Date.parse("2026-09-30T21:00:00Z")).quiet).toBe(false);
  });

  it("holds a one- or two-day chart back only while this range can still reach three tracked days", () => {
    const now = Date.parse("2026-09-29T12:00:00Z");
    const twoDays = [
      { day: "2026-09-28", follows: 2 },
      { day: "2026-09-29", follows: 1 },
    ];
    const young = report({ trackedBots: [bot("a", "2026-09-28T10:00:00Z", "2026-09-29T10:00:00Z")], follows: 3, series: twoDays });
    const fills = (r: FollowReport, rng: Parameters<typeof followCoverage>[1], at = now) =>
      followCoverage(r, rng, at).chartFillsIn;

    // Presets end now, so the same choice gains a day every day.
    const week = {
      prevFrom: "2026-09-15T12:00:00.000Z",
      from: "2026-09-22T12:00:00.000Z",
      to: "2026-09-29T12:00:00.000Z",
      rangeKey: "7d" as const,
    };
    expect(fills(young, week)).toBe(true);
    expect(fills(young, { ...week, from: "2020-01-01T00:00:00.000Z", rangeKey: "all" as const })).toBe(true);

    // Last month [Aug 1, Sep 1), viewed any day in September, first follow on Aug 31:
    // no later day can enter it, so its one day is all the chart will ever have.
    const lastMonth = {
      prevFrom: "2026-07-01T00:00:00.000Z",
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-09-01T00:00:00.000Z",
      rangeKey: "lastmonth" as const,
    };
    const aug31 = report({
      trackedBots: [bot("a", "2026-08-31T10:00:00Z", "2026-09-20T10:00:00Z")],
      follows: 2,
      series: [{ day: "2026-08-31", follows: 2 }],
    });
    expect(fills(aug31, lastMonth, Date.parse("2026-09-01T09:00:00Z"))).toBe(false);
    expect(fills(aug31, lastMonth, Date.parse("2026-09-30T21:00:00Z"))).toBe(false);
    // Its last day is Aug 31, not Sep 1 (the range ends at midnight, exclusive).
    const aug30 = report({
      trackedBots: [bot("a", "2026-08-30T10:00:00Z", "2026-09-20T10:00:00Z")],
      follows: 2,
      series: [
        { day: "2026-08-30", follows: 1 },
        { day: "2026-08-31", follows: 1 },
      ],
    });
    expect(fills(aug30, lastMonth, Date.parse("2026-09-15T12:00:00Z"))).toBe(false);

    // Custom dates: Sep 28 to Oct 5 still has days to come; Sep 28 to Sep 29 is still
    // open today but can never hold three.
    const custom = (to: string) => ({
      prevFrom: "2026-09-20T00:00:00.000Z",
      from: "2026-09-28T00:00:00.000Z",
      to,
      rangeKey: "custom" as const,
    });
    expect(fills(young, custom("2026-10-05T23:59:59.999Z"))).toBe(true);
    expect(fills(young, custom("2026-09-29T23:59:59.999Z"))).toBe(false);
    // Two days in, the third arrives tomorrow: Sep 28 to Sep 30.
    expect(fills(young, custom("2026-09-30T23:59:59.999Z"))).toBe(true);
    // All chatbots, one bot tracked since August and one that began inside a two-day
    // range that has ended: the chart starts at the range, not at August, so it is final.
    const mixed = report({
      trackedBots: [
        bot("a", "2026-08-01T00:00:00Z", "2026-09-28T09:00:00Z"),
        bot("b", "2026-09-28T10:00:00Z", "2026-09-28T11:00:00Z"),
      ],
      follows: 3,
      series: [
        { day: "2026-09-27", follows: 1 },
        { day: "2026-09-28", follows: 2 },
      ],
    });
    const closed = { ...custom("2026-09-28T23:59:59.999Z"), from: "2026-09-27T00:00:00.000Z" };
    expect(followCoverage(mixed, closed, now).lateBots.map((b) => b.id)).toEqual(["b"]);
    expect(fills(mixed, closed)).toBe(false);

    // Three tracked days, or no bot that began inside the range: nothing is held back.
    const threeDays = [...twoDays, { day: "2026-09-30", follows: 0 }];
    expect(fills({ ...young, series: threeDays }, week, Date.parse("2026-09-30T12:00:00Z"))).toBe(false);
    const oldBot = report({ trackedBots: [bot("a", "2026-08-01T00:00:00Z", "2026-09-29T10:00:00Z")], follows: 3, series: twoDays });
    expect(fills(oldBot, custom("2026-09-29T23:59:59.999Z"))).toBe(false);
  });

  it("with nothing tracked it claims nothing", () => {
    expect(followCoverage(report({ tracking: false, trackedBots: [] }), range, NOW)).toEqual({
      previousComparable: false,
      lateBots: [],
      startedAfterRange: false,
      quiet: false,
      chartFillsIn: false,
    });
  });
});

describe("the Statistics page's follower wiring", () => {
  const ig = (id: string, is_active = true): ScopeBot => ({ id, name: `Bot ${id}`, is_active, platforms: ["instagram"] });
  const messenger: ScopeBot = { id: "m", name: "Bot m", is_active: true, platforms: ["messenger"] };
  const tracked = (ids: string[]): FollowReport => ({
    tracking: ids.length > 0,
    trackedBots: ids.map((id) => ({ id, firstFollowedAt: "2026-09-01T00:00:00Z", lastFollowedAt: "2026-09-28T00:00:00Z" })),
    firstFollowedAt: ids.length ? "2026-09-01T00:00:00Z" : null,
    lastFollowedAt: ids.length ? "2026-09-28T00:00:00Z" : null,
    follows: 0,
    prevFollows: 0,
    messaged: 0,
    series: [],
    latest: [],
  });

  it("offers setup only on Instagram chatbots that can record a follow (switched on, plan active)", () => {
    const bots = [ig("a"), ig("off", false), messenger];
    expect(followScope(bots, null, true)).toEqual({ instagram: [ig("a"), ig("off", false)], recordable: [ig("a")] });
    // The webhook refuses every follow on a lapsed plan, so nothing is recordable.
    expect(followScope(bots, null, false).recordable).toEqual([]);
    // Scoped to one bot, only that bot counts.
    expect(followScope(bots, "off", true)).toEqual({ instagram: [ig("off", false)], recordable: [] });
  });

  it("one setup link per recordable bot that hasn't recorded a follow, to its own steps", () => {
    expect(followSetupLinks([ig("a"), ig("b")], tracked(["a"]))).toEqual([
      { name: "Bot b", href: "/chatbots/b?tab=connection#followers" },
    ]);
    expect(followSetupLinks([ig("a")], null)).toEqual([{ name: "Bot a", href: "/chatbots/a?tab=connection#followers" }]);
  });

  it("the card: the report once anything is tracked; the prompt only with somewhere to set up, and not hidden", () => {
    expect(followCardVisible(tracked(["a"]), 0, true)).toBe(true);
    expect(followCardVisible(tracked([]), 1, false)).toBe(true);
    expect(followCardVisible(tracked([]), 1, true)).toBe(false);
    expect(followCardVisible(tracked([]), 0, false)).toBe(false);
    expect(followCardVisible(null, 1, false)).toBe(false);
  });

  it("the skeleton holds the shape of the card that will land, or nothing", () => {
    expect(followSkeleton({ tracking: true, recordable: 0, hidden: true })).toBe("report");
    expect(followSkeleton({ tracking: false, recordable: 1, hidden: false })).toBe("setup");
    expect(followSkeleton({ tracking: null, recordable: 1, hidden: false })).toBe("setup");
    expect(followSkeleton({ tracking: false, recordable: 1, hidden: true })).toBeNull();
    expect(followSkeleton({ tracking: false, recordable: 0, hidden: false })).toBeNull();
  });

  it("says why tracked chatbots aren't recording right now", () => {
    const bots = [ig("a"), ig("b", false)];
    expect(followPause(tracked(["a", "b"]), bots, true)).toEqual({ planInactive: false, botsOff: ["Bot b"] });
    expect(followPause(tracked(["a"]), bots, false)).toEqual({ planInactive: true, botsOff: [] });
    expect(followPause(tracked(["a"]), bots, true)).toEqual({ planInactive: false, botsOff: [] });
  });

  it("the page uses exactly these helpers, for the effective user", () => {
    const page = code(STATS_PAGE);
    expect(page).toMatch(/const planActive = workspace\?\.subscriptionActive \?\? false;/);
    expect(page).toMatch(/followScope\(bots, chatbotId, planActive\)/);
    expect(page).toMatch(/followSetupLinks\(followBots\.recordable, follows\)/);
    expect(page).toMatch(/followCardVisible\(follows, followSetup\.length, hideFollowSetup\)/);
    expect(page).toMatch(/followSetupHiddenFor\(\s*cookieStore\.get\(FOLLOW_SETUP_HIDDEN_COOKIE\)\?\.value,\s*workspace\?\.userId,?\s*\)/);
    expect(page).toMatch(/<StatisticsReportSkeleton followers=\{followerSkeleton\} \/>/);
    expect(page).toMatch(/accountId=\{user!\.id\}/);
    expect(page).toMatch(/probeFollowTracking\(await createClient\(\), \{ userId: user\.id, chatbotId: botId \}\)/);
    // The range kind comes from the page's one resolveRange, so a fixed range (Last
    // month, custom dates) never promises a chart that can't fill in.
    expect(page).toMatch(/const \{ rangeKey, customFrom, customTo, from, to \} = resolveRange\(sp\);/);
    expect(page).toMatch(/<StatisticsReport[^>]*\brangeKey=\{rangeKey\}/);
    expect(page).toMatch(/followCoverage\(follows, \{ from, to, prevFrom, rangeKey \}\)/);
  });
});

describe("probeFollowTracking: one probe, scoped to the effective user", () => {
  function probeClient(result: { data: unknown; error: unknown }) {
    const calls: unknown[][] = [];
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "limit"]) {
      q[m] = (...a: unknown[]) => {
        calls.push([m, ...a]);
        return q;
      };
    }
    q.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(result).then(ok, bad);
    const client = {
      from: (t: string) => {
        calls.push(["from", t]);
        return q;
      },
    };
    return { client: client as unknown as Parameters<typeof probeFollowTracking>[0], calls };
  }

  it("filters by the user through the chatbots join, and by the bot when scoped", async () => {
    const { client, calls } = probeClient({ data: [{ chatbot_id: "b1" }], error: null });
    expect(await probeFollowTracking(client, { userId: "u1", chatbotId: "b1" })).toBe(true);
    expect(calls).toEqual([
      ["from", "instagram_follows"],
      ["select", "chatbot_id, chatbots!inner(user_id)"],
      ["eq", "chatbots.user_id", "u1"],
      ["limit", 1],
      ["eq", "chatbot_id", "b1"],
    ]);
  });

  it("nothing recorded is false; an error (no table yet) is unknown", async () => {
    expect(await probeFollowTracking(probeClient({ data: [], error: null }).client, { userId: "u1", chatbotId: null })).toBe(false);
    expect(
      await probeFollowTracking(probeClient({ data: null, error: { code: "PGRST205" } }).client, { userId: "u1", chatbotId: null })
    ).toBeNull();
  });
});

describe("the setup prompt's Hide: per browser and per account", () => {
  it("remembers each account it hid the prompt for, newest last, capped", () => {
    expect(FOLLOW_SETUP_HIDDEN_COOKIE).toBe("ss_hide_follow_setup");
    const one = withFollowSetupHidden(null, "user-a");
    expect(followSetupHiddenFor(one, "user-a")).toBe(true);
    // Hiding it while viewing client A never hides it for client B, or for yourself.
    expect(followSetupHiddenFor(one, "user-b")).toBe(false);
    expect(followSetupHiddenFor(one, null)).toBe(false);
    const two = withFollowSetupHidden(one, "user-b");
    expect(two).toBe("user-a.user-b");
    expect(withFollowSetupHidden(two, "user-a")).toBe("user-b.user-a");
    let many: string | null = null;
    for (let i = 0; i < FOLLOW_SETUP_HIDDEN_MAX + 5; i++) many = withFollowSetupHidden(many, `u${i}`);
    expect(many!.split(".")).toHaveLength(FOLLOW_SETUP_HIDDEN_MAX);
    expect(followSetupHiddenFor(many, `u${FOLLOW_SETUP_HIDDEN_MAX + 4}`)).toBe(true);
    expect(followSetupHiddenFor(many, "u0")).toBe(false);
  });

  it("reads its own value out of document.cookie and writes a year-long, site-wide cookie", () => {
    expect(readFollowSetupHidden("a=1; ss_hide_follow_setup=user-a.user-b; b=2")).toBe("user-a.user-b");
    expect(readFollowSetupHidden("a=1")).toBeNull();
    expect(followSetupHiddenCookie("user-a", true)).toBe(
      "ss_hide_follow_setup=user-a; path=/; max-age=31536000; samesite=lax; secure"
    );
    expect(followSetupHiddenCookie("user-a", false)).toBe("ss_hide_follow_setup=user-a; path=/; max-age=31536000; samesite=lax");
  });

  it("the button writes exactly that, for the account being viewed, and is a client component", () => {
    const src = read(HIDE_BUTTON);
    expect(src.trimStart().startsWith('"use client";')).toBe(true);
    const live = code(HIDE_BUTTON);
    expect(live).toMatch(/withFollowSetupHidden\(readFollowSetupHidden\(document\.cookie\), accountId\)/);
    expect(live).toMatch(/document\.cookie = followSetupHiddenCookie\(value, window\.location\.protocol === "https:"\)/);
  });
});

describe("bucketFollowSeries", () => {
  const days = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      day: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
      follows: i % 3,
    }));
  const total = (s: { follows: number }[]) => s.reduce((a, d) => a + d.follows, 0);

  it("keeps a month at one bar per day", () => {
    expect(MAX_CHART_BARS).toBe(31);
    const s = days(31);
    const b = bucketFollowSeries(s);
    expect(b).toHaveLength(31);
    expect(b.every((x, i) => x.day === s[i].day && x.lastDay === s[i].day && x.days === 1 && x.follows === s[i].follows)).toBe(true);
    expect(bucketFollowSeries([])).toEqual([]);
  });

  it("groups a long range into at most 31 bars, keeping every follow and every day", () => {
    for (const n of [32, 61, 120, 400, 2464]) {
      const s = days(n);
      const b = bucketFollowSeries(s);
      expect(b.length, String(n)).toBeLessThanOrEqual(31);
      expect(total(b), String(n)).toBe(total(s));
      expect(b.reduce((a, x) => a + x.days, 0), String(n)).toBe(n);
      expect(b[0].day, String(n)).toBe(s[0].day);
      expect(b[b.length - 1].lastDay, String(n)).toBe(s[n - 1].day);
    }
  });

  it("cuts groups from the end: the newest bar is always full, only the oldest can be short", () => {
    const s = days(41); // size 2 → 21 bars: the oldest covers 1 day, the rest 2
    const b = bucketFollowSeries(s);
    expect(b).toHaveLength(21);
    expect(b[0]).toEqual({ day: s[0].day, lastDay: s[0].day, days: 1, follows: s[0].follows });
    expect(b.slice(1).every((x) => x.days === 2)).toBe(true);
    expect(b[20]).toEqual({ day: s[39].day, lastDay: s[40].day, days: 2, follows: s[39].follows + s[40].follows });
  });
});

describe("followSetupHref: where 'Set it up' goes", () => {
  it("that bot's Connection tab, at the follower steps", () => {
    expect(FOLLOWERS_ANCHOR).toBe("followers");
    expect(followSetupHref("b1")).toBe("/chatbots/b1?tab=connection#followers");
  });
});

// ---------------------------------------------------------------------------
// The database side (static: the SQL as written).
// ---------------------------------------------------------------------------

describe("migration: instagram_follows + instagram_follow_report", () => {
  // Executable SQL only: `--` lines hold the notes and the VERIFY/ROLLBACK blocks.
  const sql = () =>
    read(MIGRATION)
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
  const fn = () => {
    const s = sql();
    return s.slice(s.indexOf("create or replace function public.instagram_follow_report("));
  };

  it("one row per bot and contact, deleted with the bot, with the identity the report matches on", () => {
    const s = sql();
    expect(s).toMatch(/create table if not exists public\.instagram_follows/i);
    expect(s).toMatch(/chatbot_id\s+uuid not null references public\.chatbots\(id\) on delete cascade/i);
    expect(s).toMatch(/external_user_id\s+text,/i);
    expect(s).toMatch(/unique \(chatbot_id, manychat_subscriber_id\)/i);
    expect(s).toMatch(/on public\.instagram_follows \(chatbot_id, followed_at desc\)/i);
  });

  it("row level security: exactly the two read policies, and nobody writes through the API", () => {
    const s = sql();
    expect(s).toMatch(/alter table public\.instagram_follows enable row level security/i);
    expect(s).not.toMatch(/disable row level security/i);
    // Counted with or without the schema, so an unqualified extra policy is caught too.
    expect(s.match(/create policy [^;]*? on (public\.)?instagram_follows\b/gi) ?? []).toHaveLength(2);
    expect(s).toMatch(/for select to authenticated using \(\s*exists \(select 1 from public\.chatbots c\s+where c\.id = chatbot_id and c\.user_id = \(select auth\.uid\(\)\)\)/i);
    expect(s).toMatch(/for select to authenticated using \(\s*\(select public\.is_superadmin\(\)\)\s*\)/i);
    expect(s).not.toMatch(/using \(\s*true\s*\)/i);
    expect(s).not.toMatch(/for (insert|update|delete|all)\b/i);
    expect(s).toMatch(/revoke all on table public\.instagram_follows from anon, authenticated;/i);
    expect(s).toMatch(/grant select on table public\.instagram_follows to authenticated;/i);
    // Every auth.uid() is the once-per-statement (select auth.uid()) form.
    expect((s.match(/auth\.uid\(\)/g) ?? []).length).toBe((s.match(/\(select auth\.uid\(\)\)/g) ?? []).length);
  });

  it("the report scopes by the analytics guard and runs as the caller (RLS still applies)", () => {
    const s = sql();
    expect(fn()).toMatch(/analytics_scope_uid\(p_user_id\)/);
    expect(fn()).not.toMatch(/security\s+definer/i);
    expect(fn()).toMatch(/set search_path = ''/);
    expect(s).toMatch(
      /revoke all on function public\.instagram_follow_report\(timestamptz, timestamptz, timestamptz, uuid, uuid, integer\) from public, anon;/
    );
    expect(s).toMatch(
      /grant execute on function public\.instagram_follow_report\(timestamptz, timestamptz, timestamptz, uuid, uuid, integer\) to authenticated, service_role;/
    );
  });

  it("every read of the follows table is limited to the bots in scope", () => {
    // Under View as client the superadmin's RLS lets every tenant's rows through,
    // so the scope filter on each read is what keeps the numbers the client's.
    // Every read, under any alias or none, must filter by the scope right away.
    const f = fn().replace(/\s+/g, " ");
    const reads = [...f.matchAll(/from (?:public\.)?instagram_follows\b(?: (?:as )?(?!where\b)(\w+))?/gi)];
    expect(reads.length).toBe(4);
    for (const r of reads) {
      const alias = r[1] ?? "instagram_follows";
      const after = f.slice(r.index! + r[0].length, r.index! + r[0].length + 70).trimStart();
      expect(after, after).toMatch(
        new RegExp(`^where ${alias}\\.chatbot_id (= s\\.id|in \\(select s\\.id from scope s\\))`)
      );
    }
  });

  it("the day series can't be stretched by the caller: it starts at the first follow and stops today", () => {
    const f = fn().replace(/\s+/g, " ");
    expect(f).toContain(
      "greatest(date_trunc('day', p_from), date_trunc('day', coalesce((select min(t.first_at) from tracked t), 'infinity'::timestamptz)))"
    );
    expect(f).toContain("least(date_trunc('day', p_to - interval '1 second'), date_trunc('day', now()))");
  });

  it("finds a follower's thread by contact id, else by the identity that survives a contact deletion", () => {
    const f = fn().replace(/\s+/g, " ");
    expect(f).toContain("c.manychat_subscriber_id = p.manychat_subscriber_id or (p.external_user_id is not null and c.external_user_id = p.external_user_id)");
    expect(f).toMatch(/left join lateral \(.*?limit 1 \) cv on true/);
    // The thread they wrote in wins over an empty one, then the exact contact id,
    // then the newest: a control-only row for a recreated contact never hides the
    // conversation they actually started.
    expect(f).toContain(
      "order by messaged desc, (c.manychat_subscriber_id = p.manychat_subscriber_id) desc, c.last_message_at desc nulls last limit 1"
    );
    for (const key of ["'tracked_bots'", "'first_followed_at'", "'last_followed_at'"]) expect(f).toContain(key);
  });

  it("each tracked bot carries its own first and last follow (All chatbots can mix start dates)", () => {
    const f = fn().replace(/\s+/g, " ");
    expect(f).toContain(
      "jsonb_build_object( 'id', t.chatbot_id, 'first_followed_at', t.first_at, 'last_followed_at', t.last_at ) order by t.first_at, t.chatbot_id"
    );
  });
});

// ---------------------------------------------------------------------------
// The screens.
// ---------------------------------------------------------------------------

describe("the owner-facing pieces", () => {
  const followersBlock = () => {
    const tab = code(TAB_PANEL);
    const start = tab.indexOf("id={FOLLOWERS_ANCHOR}");
    expect(start, "followers block not found").toBeGreaterThan(-1);
    return tab.slice(start, tab.indexOf("</SsCard>", start));
  };

  it("the Connection tab shows the exact body to paste, under the anchor 'Set it up' links to", () => {
    const block = followersBlock();
    expect(block).toContain('"event": "${FOLLOW_EVENT}"');
    expect(block).toContain('"chatbot_id": "${chatbot.id}"');
    expect(block).toContain('"platform": "instagram"');
    // The line that carries the contact id: without it every follow 400s.
    expect(block).toContain('"contact": <Full Contact Data>');
    expect(hasUnicodeDash(block)).toBe(false);
  });

  it("the body the Connection tab shows, filled in the way ManyChat sends it, records the follower", async () => {
    const tpl = followersBlock().match(/label="JSON body \(new followers\)"\s*value=\{`([\s\S]*?)`\}/)?.[1];
    expect(tpl, "the followers body template").toBeTruthy();
    const pasted = tpl!
      .replace("${chatbot.id}", BOT_ID)
      .replace("${FOLLOW_EVENT}", FOLLOW_EVENT)
      .replace(
        "<Full Contact Data>",
        JSON.stringify({ id: "555", ig_username: "new.fan", first_name: "New", last_name: "Fan", last_input_text: null })
      );
    expect(pasted).not.toMatch(/\$\{|<Full Contact Data>/);
    const { status, body } = await post(JSON.parse(pasted));
    expect(status).toBe(200);
    expect(body.reason).toBe("follow_recorded");
    expect(writes[0].row).toMatchObject({ manychat_subscriber_id: "555", username: "new.fan", display_name: "New Fan" });
  });

  it("the steps include ManyChat's Flow Builder switch and where the request must sit", () => {
    const block = followersBlock();
    expect(block).toContain("Switch to Flow Builder");
    expect(block).toContain("before the first message");
    expect(block).not.toContain("Instagram: New Follower");
  });

  it("the steps warn that a test run saves the test contact, and name the switch that stops recording", () => {
    const block = followersBlock().replace(/\s+/g, " ");
    expect(block).toContain("Test Request and Preview send the contact you test with");
    expect(block).toContain("AI replies are on and your plan is active");
  });

  it("the coverage notes name the real rule: existing ManyChat contacts are skipped", () => {
    for (const text of [followersBlock(), read(CARD)]) {
      expect(text).toMatch(/ManyChat\s+contacts/);
      expect(text).toContain("comment-to-DM");
    }
  });

  it("the Statistics page asks for the effective user's report", () => {
    const page = code(STATS_PAGE);
    const calls = callArgs(page, "getFollowReport");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/userId:\s*user!?\.id/);
  });

  it("the Statistics page shows a change only against a fully tracked previous period", () => {
    const page = code(STATS_PAGE);
    expect(page).toMatch(/coverage\.previousComparable\s*\?\s*deltaLabel\(follows\.follows/);
    expect(page).toMatch(/coverage\.previousComparable\s*\?\s*deltaTone\(follows\.follows/);
    expect(page.match(/deltaLabel\(follows\./g) ?? []).toHaveLength(1);
  });

  it("no em or en dashes in the follower screens' copy", () => {
    for (const file of [CARD, HIDE_BUTTON, "lib/follows.ts", "lib/follow-setup-cookie.ts"]) {
      expect(hasUnicodeDash(read(file)), file).toBe(false);
    }
  });
});
