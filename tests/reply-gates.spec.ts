import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { readdirSync } from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { hasUnicodeDash } from "@/lib/sanitize";
import { botReplySilenced, keepsReplyingToSubscribed } from "@/lib/conversation-silence";
import { code, read, ROOT, sourceFiles } from "./helpers/source";

/**
 * Which conversation tags stop the bot's own replies, and which chatbot switch
 * turns each stop off.
 *
 * The incident (2026-09-29, HTKeem Bot): after the model went quiet on one message
 * and the thread was flagged "Needs attention", the thread said "the AI stopped here
 * so you can close it yourself". It hadn't: needs_human never stops the bot. The
 * owner read it as "a flag stops the bot" and asked that only Spam and Disqualified
 * stop it (unless "Keep replying when tagged" is on), that Subscribed stop it too,
 * and that a separate chatbot switch let the bot keep answering subscribed users.
 *
 *  - needs_human (and every other working tag) never stops the bot.
 *  - Disqualified and Bot / Spam stop it unless keep_replies_when_tagged.
 *  - Subscribed stops it unless keep_replies_when_subscribed. Before that column
 *    exists, keep_replies_when_tagged still covers subscribed, as it always did.
 *  - A human takeover, BOT_OFF and the lead's own "stop" always win.
 */

const WEBHOOK = "app/api/webhooks/manychat/route.ts";
const THREAD_PAGE = "app/(dashboard)/conversations/[id]/page.tsx";
const TOGGLE = "components/dashboard/keep-replies-toggle.tsx";
const TAB_PANEL = "components/dashboard/chatbot-tab-panel.tsx";

const SUBSCRIBED = { confirmed_at: "2026-09-20T10:00:00Z", tag: "subscribed" };

describe("botReplySilenced: what the inbox treats as the bot staying quiet", () => {
  it("needs attention, and every other working tag, never stops the bot", () => {
    for (const tag of ["needs_human", "lead", "wants_call", "starting_later"]) {
      expect(botReplySilenced({ status: "active", tag }), tag).toBe(false);
    }
  });

  it("Subscribed stops it unless the chatbot keeps replying to subscribed users", () => {
    expect(botReplySilenced(SUBSCRIBED)).toBe(true);
    expect(botReplySilenced(SUBSCRIBED, { keep_replies_when_subscribed: true })).toBe(false);
    // "Keep replying when tagged" no longer covers subscribed users...
    expect(botReplySilenced(SUBSCRIBED, { keep_replies_when_tagged: true, keep_replies_when_subscribed: false })).toBe(true);
    // ...except before the new column exists, when it still does.
    expect(botReplySilenced(SUBSCRIBED, { keep_replies_when_tagged: true })).toBe(false);
  });

  it("Disqualified and Bot / Spam stop it unless the chatbot keeps replying when tagged", () => {
    for (const tag of ["disqualified", "bot"]) {
      expect(botReplySilenced({ tag }), tag).toBe(true);
      expect(botReplySilenced({ tag }, { keep_replies_when_tagged: true }), tag).toBe(false);
      expect(botReplySilenced({ tag }, { keep_replies_when_subscribed: true }), tag).toBe(true);
    }
  });

  it("a human takeover, BOT_OFF and the lead's own stop always win", () => {
    const both = { keep_replies_when_tagged: true, keep_replies_when_subscribed: true };
    expect(botReplySilenced({ status: "ai_paused", tag: "lead" }, both)).toBe(true);
    expect(botReplySilenced({ bot_off_at: "2026-09-01T00:00:00Z" }, both)).toBe(true);
    expect(botReplySilenced({ user_muted_at: "2026-09-01T00:00:00Z" }, both)).toBe(true);
  });

  it("keepsReplyingToSubscribed reads the new switch, falling back to the old one only when it is missing", () => {
    expect(keepsReplyingToSubscribed({})).toBe(false);
    expect(keepsReplyingToSubscribed({ keep_replies_when_subscribed: true })).toBe(true);
    expect(keepsReplyingToSubscribed({ keep_replies_when_subscribed: false, keep_replies_when_tagged: true })).toBe(false);
    expect(keepsReplyingToSubscribed({ keep_replies_when_tagged: true })).toBe(true);
    expect(keepsReplyingToSubscribed({ keep_replies_when_subscribed: null, keep_replies_when_tagged: true })).toBe(true);
    expect(keepsReplyingToSubscribed(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The real webhook over a recording Supabase stand-in. A bare "ok" from a bot
// with no persona is answered by the trivial acknowledgement, which sits after
// every tag gate: reason "trivial_ack" means the gates let the message through.
// ---------------------------------------------------------------------------

const SECRET = "whsec-gates";
const BOT_ID = "5d1c6a0e-7f7e-4a1b-9c1f-2b3e4d5f6a70";

let chatbotRow: Record<string, unknown>;
/** The row the step-4 lookup finds (null: this subscriber id is new). */
let conversation: Record<string, unknown> | null;
/** A returning contact's earlier threads, found by their stable external id. */
let priorThreads: Record<string, unknown>[];

function table(name: string) {
  const chain: Record<string, unknown> = {};
  let listed = false;
  for (const m of ["select", "eq", "neq", "in", "is", "gte", "lt", "order", "abortSignal", "update", "insert", "upsert"]) {
    chain[m] = () => chain;
  }
  chain.limit = () => {
    listed = true;
    return chain;
  };
  const result = () => {
    if (name === "chatbots") return { data: chatbotRow, error: null };
    if (name === "subscriptions") return { data: { status: "active", comp_expires_at: null }, error: null };
    if (name === "conversations") return { data: listed ? priorThreads : conversation, error: null };
    if (name === "messages") return { data: { id: "m1" }, error: null };
    return { data: null, error: null };
  };
  chain.maybeSingle = async () => result();
  // The step-4 upsert creates the row a new subscriber id needs.
  chain.single = async () =>
    name === "conversations" && !conversation ? { data: { id: "conv-new", status: "active" }, error: null } : result();
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
  sendManychatMessage: vi.fn(async () => ({ ok: true })),
  sendManychatSequencePaced: vi.fn(async () => ({ ok: true })),
  sendManychatMedia: vi.fn(async () => ({ ok: true })),
  sendManychatFlow: vi.fn(async () => ({ ok: true })),
}));

// The switch card is a client component: it refreshes the router and writes through
// the browser Supabase client.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ from: () => ({}) }) }));

vi.mock("@/lib/limits", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/limits")>()),
  checkChatbotInboundLimit: vi.fn(async () => ({ ok: true, limit: 600, remaining: 599, bypassed: false })),
  checkDuplicate: vi.fn(async () => ({ isDuplicate: false })),
}));

let POST: (typeof import("@/app/api/webhooks/manychat/route"))["POST"];
beforeAll(async () => {
  ({ POST } = await import("@/app/api/webhooks/manychat/route"));
}, 120_000);

async function post(subscriberId: string, extra: Record<string, unknown> = {}): Promise<unknown> {
  const res = await POST(
    new NextRequest("http://localhost/api/webhooks/manychat", {
      method: "POST",
      headers: { "content-type": "application/json", "x-manychat-secret": SECRET },
      body: JSON.stringify({ chatbot_id: BOT_ID, subscriber_id: subscriberId, platform: "instagram", message: "ok", ...extra }),
    })
  );
  return ((await res.json()) as Record<string, unknown>).reason;
}

/**
 * A contact whose ManyChat contact was deleted and re-created: a new subscriber id,
 * the same stable external id, and an earlier thread in the given state.
 */
async function returningReasonFor(bot: Record<string, unknown>, prior: Record<string, unknown>): Promise<unknown> {
  chatbotRow = { id: BOT_ID, user_id: "owner-1", webhook_secret: SECRET, is_active: true, keep_replies_when_tagged: false, ...bot };
  conversation = null;
  priorThreads = [{ status: "active", user_muted_at: null, bot_off_at: null, confirmed_at: null, tag: "lead", ...prior }];
  return post("8", { external_user_id: "ig-555" });
}

async function reasonFor(bot: Record<string, unknown>, thread: Record<string, unknown>): Promise<unknown> {
  priorThreads = [];
  chatbotRow = {
    id: BOT_ID,
    user_id: "owner-1",
    webhook_secret: SECRET,
    is_active: true,
    keep_replies_when_tagged: false,
    ...bot,
  };
  conversation = {
    id: "conv-1",
    status: "active",
    tag: "lead",
    confirmed_at: null,
    bot_off_at: null,
    user_muted_at: null,
    unread_count: 0,
    contact_name: "Lead",
    contact_username: "lead",
    external_user_id: null,
    keyword_fired: [],
    welcomed_at: "2026-09-01T00:00:00Z",
    ...thread,
  };
  return post("7");
}

beforeEach(() => {
  vi.stubEnv("MANYCHAT_WEBHOOK_SECRET", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("webhook: the keyword gate and its manual override", () => {
  const GATED = { keyword_gate_enabled: true };
  const FORCED_ON = { bot_forced_on_at: "2026-10-06T14:40:00Z" };

  it("a keyword-only bot stays silent for a contact who never matched a keyword", async () => {
    expect(await reasonFor(GATED, {})).toBe("keyword_gate_blocked");
  });

  it("answers that contact once the owner switched the bot on for them (BOT_ON, or the Welcome button)", async () => {
    // tests/send-welcome.spec.ts pins that the Welcome button writes this override.
    expect(await reasonFor(GATED, FORCED_ON)).toBe("trivial_ack");
    // Strict matching changes what counts as a keyword, never who is already engaged.
    expect(await reasonFor({ ...GATED, keyword_strict_enabled: true }, FORCED_ON)).toBe("trivial_ack");
  });

  it("the override lifts the keyword gate and nothing else", async () => {
    expect(await reasonFor(GATED, { ...FORCED_ON, status: "ai_paused" })).toBe("human_takeover");
    expect(await reasonFor(GATED, { ...FORCED_ON, bot_off_at: "2026-10-01T00:00:00Z" })).toBe("bot_off_stopped");
    expect(await reasonFor(GATED, { ...FORCED_ON, ...SUBSCRIBED })).toBe("subscribed_stopped");
    expect(await reasonFor(GATED, { ...FORCED_ON, tag: "disqualified" })).toBe("disqualified_stopped");
    expect(await reasonFor(GATED, { ...FORCED_ON, user_muted_at: "2026-10-01T00:00:00Z" })).toBe("user_muted");
  });
});

describe("webhook: which tags stop the bot", () => {
  it("a thread flagged needs attention still gets its reply", async () => {
    expect(await reasonFor({}, { tag: "needs_human" })).toBe("trivial_ack");
  });

  it("Subscribed stops the bot unless the chatbot keeps replying to subscribed users", async () => {
    expect(await reasonFor({}, SUBSCRIBED)).toBe("subscribed_stopped");
    expect(await reasonFor({ keep_replies_when_subscribed: true }, SUBSCRIBED)).toBe("trivial_ack");
    // "Keep replying when tagged" alone no longer reaches subscribed users.
    expect(await reasonFor({ keep_replies_when_tagged: true, keep_replies_when_subscribed: false }, SUBSCRIBED)).toBe(
      "subscribed_stopped"
    );
  });

  it("before the migration, Keep replying when tagged still covers subscribed users", async () => {
    // select("*") on a database without the column returns no such key at all.
    expect(await reasonFor({ keep_replies_when_tagged: true }, SUBSCRIBED)).toBe("trivial_ack");
  });

  it("Disqualified and Bot / Spam stop the bot unless the chatbot keeps replying when tagged", async () => {
    for (const tag of ["disqualified", "bot"]) {
      expect(await reasonFor({}, { tag }), tag).toBe("disqualified_stopped");
      expect(await reasonFor({ keep_replies_when_tagged: true }, { tag }), tag).toBe("trivial_ack");
      expect(await reasonFor({ keep_replies_when_subscribed: true }, { tag }), tag).toBe("disqualified_stopped");
    }
  });

  it("a returning contact's first message follows the same switches as every later one", async () => {
    // Prior thread subscribed: silent by default, answered once the bot keeps replying to subscribed users.
    const subscribed = { confirmed_at: "2026-09-20T10:00:00Z", tag: "subscribed" };
    expect(await returningReasonFor({}, subscribed)).toBe("returning_contact_paused");
    expect(await returningReasonFor({ keep_replies_when_subscribed: true }, subscribed)).toBe("trivial_ack");
    // Prior thread disqualified: the tagged switch decides.
    expect(await returningReasonFor({}, { tag: "disqualified" })).toBe("returning_contact_paused");
    expect(await returningReasonFor({ keep_replies_when_tagged: true }, { tag: "disqualified" })).toBe("trivial_ack");
    // A paused, muted or BOT_OFF prior thread stays silent whatever the switches say.
    const both = { keep_replies_when_tagged: true, keep_replies_when_subscribed: true };
    expect(await returningReasonFor(both, { status: "ai_paused" })).toBe("returning_contact_paused");
    expect(await returningReasonFor(both, { user_muted_at: "2026-09-01T00:00:00Z" })).toBe("returning_contact_paused");
    expect(await returningReasonFor(both, { bot_off_at: "2026-09-01T00:00:00Z" })).toBe("returning_contact_paused");
    // A needs-attention prior thread carries nothing.
    expect(await returningReasonFor({}, { tag: "needs_human" })).toBe("trivial_ack");
  });

  it("the follow-up drip stays off for subscribed users whatever the switches say", async () => {
    const { evaluateFollowup, followupBlocked } = await import("@/lib/followup");
    const chatbot = {
      auto_followup_enabled: true,
      auto_followup_steps: [{ delay_hours: 1, text: "just checking in" }],
      keep_replies_when_tagged: true,
      keep_replies_when_subscribed: true,
    } as unknown as Parameters<typeof evaluateFollowup>[0];
    const conv = {
      status: "active" as const,
      confirmed_at: "2026-09-20T10:00:00Z",
      tag: "subscribed" as const,
      platform: "instagram" as const,
      last_message_at: "2026-09-29T10:00:00Z",
      last_followup_at: null,
      followup_count: 0,
      followup_step_index: 0,
    };
    expect(evaluateFollowup(chatbot, conv, new Date("2026-09-29T12:00:00Z"))).toMatchObject({ due: false, reason: "confirmed" });
    expect(followupBlocked(conv)).toBe(true);
    // The follow-up cron never even loads a subscribed thread.
    expect(code("app/api/cron/followups/route.ts")).toMatch(/\.is\("confirmed_at", null\)/);
  });

  it("a paused thread stays paused whatever the switches say", async () => {
    const both = { keep_replies_when_tagged: true, keep_replies_when_subscribed: true };
    expect(await reasonFor(both, { status: "ai_paused", tag: "needs_human" })).toBe("human_takeover");
  });

  it("the pre-reply screen still honours Keep replying when tagged, not the subscribed switch", () => {
    const src = code(WEBHOOK);
    expect(src).toMatch(/if \(!keepRepliesWhenTagged\) \{\s*await releaseClaim\(\);/);
    expect(src).toMatch(/const keepRepliesWhenSubscribed = keepsReplyingToSubscribed\(chatbot\);/);
    expect(src).toMatch(/if \(existing\?\.confirmed_at && !keepRepliesWhenSubscribed\)/);
  });
});

describe("the thread page", () => {
  it("describes the needs-attention flag, and never says it stopped the AI or promises what the AI will do", () => {
    // Whitespace-normalized, so re-wrapping the JSX text can't break it.
    const page = read(THREAD_PAGE).replace(/\s+/g, " ");
    expect(page).not.toMatch(/AI stopped here|AI still answers/);
    expect(page).toContain(
      "Flagged <strong>needs attention</strong>: a person should take a look. This flag does not pause the AI."
    );
  });

  it("no dashboard screen says a needs-attention flag stops or steps back the AI", () => {
    const screens = sourceFiles().filter((f) => f.startsWith("app/(dashboard)/") || f.startsWith("components/dashboard/"));
    expect(screens.length).toBeGreaterThan(20);
    for (const f of screens) expect(read(f), f).not.toMatch(/stepped back|AI stopped|the AI stops/i);
  });

  it("reads the subscribed switch on its own, so a database without it still opens every thread", () => {
    const page = code(THREAD_PAGE);
    // The thread's own query never names the new column (a missing column would 404 the thread).
    expect(page).toMatch(/\.select\("\*, chatbots\(name, keep_replies_when_tagged\)"\)/);
    expect(page).toMatch(/\.from\("chatbots"\)\s*\.select\("keep_replies_when_subscribed"\)/);
    // Both switches reach the inbox's silence check: the old one from the embed, the new one from its own read.
    expect(page).toMatch(
      /botReplySilenced\(conversation, \{\s*keep_replies_when_tagged: keepRepliesWhenTagged,\s*keep_replies_when_subscribed:\s*replySwitches\?\.keep_replies_when_subscribed,?\s*\}\)/
    );
  });
});

describe("the chatbot's switches", () => {
  it("a separate switch keeps replying to subscribed users, and the old one no longer claims them", () => {
    const toggle = read(TOGGLE);
    expect(toggle).toContain("Keep replying to subscribed users");
    expect(toggle).toMatch(/keep_replies_when_subscribed/);
    expect(toggle).toMatch(/keep_replies_when_tagged/);
    // The old switch's description names only the tags it still covers.
    expect(toggle).toMatch(/disqualified or Bot \/ Spam/);
    expect(hasUnicodeDash(code(TOGGLE))).toBe(false);
    expect(code(TAB_PANEL)).toMatch(/initialSubscribed=\{keepsReplyingToSubscribed\(chatbot\)\}/);
  });

  it("each switch is wired to its own column and starts from its own value", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { KeepRepliesToggle } = await import("@/components/dashboard/keep-replies-toggle");
    const html = renderToStaticMarkup(
      createElement(KeepRepliesToggle, { chatbotId: "b1", initialTagged: false, initialSubscribed: true })
    );
    const switchFor = (label: string) => {
      const forId = new RegExp(`<label[^>]*for="([^"]+)"[^>]*>${label}</label>`).exec(html)?.[1];
      expect(forId, label).toBeTruthy();
      return new RegExp(`<button[^>]*id="${forId}"[^>]*>`).exec(html)?.[0] ?? "";
    };
    const tagged = switchFor("Keep replying when tagged");
    const subscribed = switchFor("Keep replying to subscribed users");
    expect(tagged).toContain('id="reply-switch-keep_replies_when_tagged"');
    expect(tagged).toContain('aria-checked="false"');
    expect(subscribed).toContain('id="reply-switch-keep_replies_when_subscribed"');
    expect(subscribed).toContain('aria-checked="true"');
  });

  it("the migration adds the switch off by default and carries over any bot that kept replying when tagged, once", () => {
    const file = readdirSync(path.join(ROOT, "supabase/migrations")).find((f) =>
      /keep-replies-when-subscribed\.sql$/.test(f)
    );
    expect(file).toBeTruthy();
    // SQL only: drop the -- comments (the VERIFY block quotes the column too).
    const sql = read(`supabase/migrations/${file}`)
      .toLowerCase()
      .split(/\r?\n/)
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    // The backfill runs only in the run that creates the column: afterwards the two
    // switches are independent, so a re-run must not switch one back on.
    expect(sql).toMatch(
      /if not exists \([\s\S]*column_name = 'keep_replies_when_subscribed'[\s\S]*\) then\s+alter table public\.chatbots\s+add column keep_replies_when_subscribed boolean not null default false;\s+update public\.chatbots\s+set keep_replies_when_subscribed = true\s+where keep_replies_when_tagged;\s+end if;/
    );
    expect(sql.match(/update public\.chatbots/g) ?? []).toHaveLength(1);
    // The webhook reads chatbots on every DM: fail fast instead of queueing behind a long transaction.
    expect(sql).toMatch(/begin;\s+set local lock_timeout = '3s';[\s\S]*commit;/);
  });
});
