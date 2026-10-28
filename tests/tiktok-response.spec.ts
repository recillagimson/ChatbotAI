import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { AI_FAILURE_FALLBACK } from "@/lib/ai-reply";
import { buildSystemPrompt } from "@/lib/anthropic";
import type { Chatbot } from "@/lib/types";

/**
 * TikTok replies ride the webhook's HTTP response.
 *
 * ManyChat has no API to push a message to a TikTok contact, so the webhook answers a
 * TikTok DM while ManyChat waits, and the owner's flow sends the `reply` it gets back.
 * ManyChat stops waiting after about 10 seconds. The rules pinned here:
 *  - the AI call has a deadline inside that wait (a slow model gives the fallback line,
 *    never nothing), and the bot's reply wait never applies;
 *  - nothing that needs ManyChat's API is attempted on TikTok: no Welcome VM flow (the AI
 *    answers the opener instead), no link tokens in the prompt, and a token the model
 *    writes anyway never reaches the lead;
 *  - a picture goes back in the response (media_key/media_url) for the flow to send:
 *    pictures only, one per reply. A library item with its own TikTok flow (any kind)
 *    is sent by starting that flow a moment after the response instead;
 *  - Instagram, which ManyChat can push to, is unchanged.
 */

const SECRET = "whsec-tiktok";
const BOT_ID = "6f1e2d3c-4b5a-4968-8776-655443322110";
const REPLY = "Totally. It's $97 a month, and you can cancel anytime.";

let chatbotRow: Record<string, unknown>;
let conversation: Record<string, unknown> | null;
let stored: Record<string, unknown>[];
let writes: { table: string; op: string; row: Record<string, unknown> }[];
let afterTasks: (() => unknown)[];

const sends = { message: vi.fn(), paced: vi.fn(), media: vi.fn(), flow: vi.fn() };
const generate = vi.fn();
const fetchAssets = vi.fn();

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

function table(name: string) {
  const chain: Record<string, unknown> = {};
  let op: string | null = null;
  let write: Record<string, unknown> | null = null;
  for (const m of ["select", "eq", "neq", "in", "is", "not", "gte", "lt", "order", "limit", "abortSignal", "returns"]) {
    chain[m] = () => chain;
  }
  for (const kind of ["update", "insert", "upsert"]) {
    chain[kind] = (row: Record<string, unknown>) => {
      op = kind;
      write = row;
      writes.push({ table: name, op: kind, row });
      if (name === "messages" && row.role === "user") {
        stored = [{ id: "m-new", role: "user", content: row.content, created_at: minutesAgo(0), media_url: null }, ...stored];
      }
      return chain;
    };
  }
  const result = () => {
    if (name === "chatbots") return { data: chatbotRow, error: null };
    if (name === "subscriptions") return { data: { status: "active", comp_expires_at: null }, error: null };
    if (name === "conversations") {
      if (!conversation) {
        if (op !== "upsert") return { data: null, error: null };
        conversation = { id: "conv-new", status: "active", ...write };
        return { data: { id: "conv-new", status: "active" }, error: null };
      }
      if (!write) return { data: { ...conversation }, error: null };
      Object.assign(conversation, write);
      return { data: [{ id: conversation.id }], error: null };
    }
    if (name === "messages") {
      if (write) return { data: { id: "m-new", created_at: minutesAgo(0) }, error: null };
      return { data: stored, error: null };
    }
    return { data: null, error: null };
  };
  const settle = () => {
    const p = Promise.resolve(result());
    return Object.assign(p, { returns: () => p });
  };
  chain.maybeSingle = settle;
  chain.single = settle;
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result()).then(resolve, reject);
  return chain;
}

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  unstable_after: (task: () => unknown) => {
    afterTasks.push(task);
  },
}));
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
vi.mock("@/lib/limits", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/limits")>()),
  checkChatbotInboundLimit: vi.fn(async () => ({ ok: true, limit: 600, remaining: 599, bypassed: false })),
  checkDuplicate: vi.fn(async () => ({ isDuplicate: false })),
}));
vi.mock("@/lib/anthropic", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/anthropic")>()),
  generateReply: (...a: unknown[]) => generate(...a),
}));
vi.mock("@/lib/followup-assets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/followup-assets")>()),
  fetchFollowupAssets: (...a: unknown[]) => fetchAssets(...a),
}));
// The live BOT_OFF tag read is a ManyChat call of its own (tests/bot-off-tag.spec.ts).
vi.mock("@/lib/bot-off-tag", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/bot-off-tag")>()),
  isTaggedBotOff: async () => false,
}));
vi.mock("@/lib/retrieval", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/retrieval")>()),
  buildKbBlock: async () => ({ block: "", mode: "none", chunks: 0, topSimilarity: null }),
}));
vi.mock("@/lib/followup-flag", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/followup-flag")>()),
  syncNoFollowupFlag: async () => {},
}));
vi.mock("@/lib/memory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/memory")>()),
  refreshConversationMemory: async () => {},
}));
vi.mock("@/lib/lead-facts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/lead-facts")>()),
  refreshKnownFacts: async () => {},
}));
vi.mock("@/lib/flow-state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/flow-state")>()),
  refreshFlowState: async () => {},
}));

let POST: (typeof import("@/app/api/webhooks/manychat/route"))["POST"];
beforeAll(async () => {
  vi.stubEnv("AUTO_TAG_ENABLED", "false");
  ({ POST } = await import("@/app/api/webhooks/manychat/route"));
}, 120_000);

async function post(body: Record<string, unknown>) {
  const res = await POST(
    new NextRequest("http://localhost/api/webhooks/manychat", {
      method: "POST",
      headers: { "content-type": "application/json", "x-manychat-secret": SECRET },
      body: JSON.stringify({ chatbot_id: BOT_ID, subscriber_id: "7", ...body }),
    })
  );
  return (await res.json()) as Record<string, unknown>;
}
async function runQueued() {
  for (const task of afterTasks.splice(0)) await task();
}
/** runQueued with the clock skipped past the pause before a TikTok media flow. */
async function runQueuedWithTimers() {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  try {
    const done = runQueued();
    await vi.runAllTimersAsync();
    await done;
  } finally {
    vi.useRealTimers();
  }
}
/** What the model was asked on its (only) call. */
const asked = () => generate.mock.calls[0][0] as Record<string, unknown>;
const tiktok = (message: string) => ({ platform: "tiktok", message });
const instagram = (message: string) => ({ platform: "instagram", message });

beforeEach(() => {
  vi.stubEnv("MANYCHAT_WEBHOOK_SECRET", "");
  vi.stubEnv("RESPONSE_MIN_REPLY_MS", "0"); // no human-like pause unless a test asks for one
  vi.stubEnv("MANYCHAT_API_KEY", "mc-test-key");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  // An open bot (no keyword gate) with a persona, so a short message gets a real answer.
  chatbotRow = {
    id: BOT_ID,
    user_id: "owner-1",
    name: "Bot",
    webhook_secret: SECRET,
    is_active: true,
    keyword_gate_enabled: false,
    keyword_triggers: [],
    persona_section: "Be brief.",
    reply_debounce_seconds: 60,
  };
  conversation = {
    id: "conv-1",
    status: "active",
    tag: "lead",
    platform: "tiktok",
    confirmed_at: null,
    bot_off_at: null,
    user_muted_at: null,
    bot_forced_on_at: null,
    welcomed_at: minutesAgo(600),
    reply_claimed_for: null,
    unread_count: 0,
    contact_name: "Lead",
    contact_username: "lead",
    external_user_id: null,
    keyword_fired: [],
  };
  stored = [row("m1", "assistant", "Hey! What are you looking for?", 30)];
  writes = [];
  afterTasks = [];
  for (const s of [...Object.values(sends), generate, fetchAssets]) s.mockReset();
  for (const s of Object.values(sends)) s.mockResolvedValue(undefined);
  generate.mockResolvedValue({ text: REPLY, tokensUsed: 12, finishReason: "stop", refused: false });
  fetchAssets.mockResolvedValue([]);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function row(id: string, role: string, content: string, minutes: number) {
  return { id, role, content, created_at: minutesAgo(minutes), media_url: null };
}

const asset = (key: string, kind: string, url: string) =>
  ({ id: key, key, kind, url, mime: kind === "image" ? "image/png" : "video/mp4", label: null, description: null });
const REVIEWS = asset("reviews", "image", "https://cdn.example.com/reviews.png");
const RESULTS = asset("results", "image", "https://cdn.example.com/results.png");
const DEMO_VIDEO = asset("demo", "video", "https://cdn.example.com/demo.mp4");

describe("a TikTok DM is answered inside ManyChat's wait", () => {
  it("returns the reply in the response, with a deadline on the AI call", async () => {
    const before = Date.now();
    const body = await post(tiktok("what does it cost?"));
    const after = Date.now();
    expect(body.reply).toBe(REPLY);
    expect(body.ai_delivery).toBe("response");
    expect(generate).toHaveBeenCalledTimes(1);
    const { deadlineAt, retries } = asked() as { deadlineAt: number; retries: number };
    // Due 8s after the request arrived: inside ManyChat's ~10s, with time to save it.
    expect(deadlineAt).toBeGreaterThanOrEqual(before + 8_000);
    expect(deadlineAt).toBeLessThanOrEqual(after + 8_000);
    expect(retries).toBe(1);
    for (const s of Object.values(sends)) expect(s).not.toHaveBeenCalled();
  });

  it("never waits out the bot's reply wait first", async () => {
    // reply_debounce_seconds is 60 here: a TikTok reply can't wait for a burst.
    const before = Date.now();
    await post(tiktok("what does it cost?"));
    expect(Date.now() - before).toBeLessThan(3_000);
  });

  it("holds a fast reply for a human-like pause before answering", async () => {
    vi.stubEnv("RESPONSE_MIN_REPLY_MS", "400");
    const before = Date.now();
    await post(tiktok("what does it cost?"));
    expect(Date.now() - before).toBeGreaterThanOrEqual(380);
  });

  it("returns the reply in up to 3 parts for the flow to send with pauses, like Instagram's bubbles", async () => {
    const text = "Totally.\n\nIt's $97 a month.\n\nYou can cancel anytime.\n\nWant the link?";
    generate.mockResolvedValue({ text, tokensUsed: 12, finishReason: "stop", refused: false });
    const body = await post(tiktok("what does it cost?"));
    expect(body.reply).toBe(text); // a flow that sends `reply` keeps working
    expect(body.reply_1).toBe("Totally.");
    expect(body.reply_2).toBe("It's $97 a month.");
    // Anything past the third part rides in the last one.
    expect(body.reply_3).toContain("You can cancel anytime.");
    expect(body.reply_3).toContain("Want the link?");
  });

  it("a one-part reply leaves parts 2 and 3 empty, so last turn's values are overwritten", async () => {
    const body = await post(tiktok("what does it cost?"));
    expect(body).toMatchObject({ reply_1: REPLY, reply_2: "", reply_3: "" });
  });

  it("a model too slow for the deadline gives the lead the fallback line, not nothing", async () => {
    generate.mockRejectedValue(Object.assign(new Error("deadline"), { name: "TimeoutError" }));
    const body = await post(tiktok("what does it cost?"));
    expect(body.reply).toBe(AI_FAILURE_FALLBACK);
  });

  it("an Instagram DM is pushed in the background as before, with no deadline", async () => {
    conversation!.platform = "instagram";
    chatbotRow.reply_debounce_seconds = 0;
    const body = await post(instagram("what does it cost?"));
    expect(body.ai_queued).toBe(true);
    await runQueued();
    expect(asked().deadlineAt).toBeUndefined();
  });
});

describe("TikTok gets only what TikTok can show", () => {
  it("a welcome bot's opener is answered by the AI, with no Welcome VM flow fired", async () => {
    Object.assign(chatbotRow, { welcome_enabled: true, welcome_flow_ns: "content20260101" });
    conversation!.welcomed_at = null;
    stored = [];
    const body = await post(tiktok("hey"));
    await runQueued();
    expect(sends.flow).not.toHaveBeenCalled();
    expect(body.reply).toBe(REPLY);
    // Left unset, so the same contact can still be welcomed if the channel ever can be.
    expect(writes.some((w) => w.table === "conversations" && "welcomed_at" in w.row)).toBe(false);
  });

  it("(the same opener on Instagram still fires the Welcome VM)", async () => {
    Object.assign(chatbotRow, { welcome_enabled: true, welcome_flow_ns: "content20260101", reply_debounce_seconds: 0 });
    Object.assign(conversation!, { platform: "instagram", welcomed_at: null });
    stored = [];
    const body = await post(instagram("hey"));
    await runQueued();
    expect(body.reason).toBe("welcome_sent");
    expect(sends.flow).toHaveBeenCalledTimes(1);
  });

  it("the model is offered pictures only (TikTok's Send Message has no video or audio block)", async () => {
    chatbotRow.ai_media_enabled = true;
    fetchAssets.mockResolvedValue([REVIEWS, DEMO_VIDEO]);
    await post(tiktok("can you show me results?"));
    expect(asked().mediaCatalog).toContain("reviews");
    expect(asked().mediaCatalog).not.toContain("demo");
  });

  it("an item with its own TikTok flow is offered too, whatever it is", async () => {
    chatbotRow.ai_media_enabled = true;
    fetchAssets.mockResolvedValue([REVIEWS, { ...DEMO_VIDEO, tiktok_flow_ns: "content_demo" }]);
    await post(tiktok("can you show me results?"));
    expect(asked().mediaCatalog).toContain("demo");
  });

  it("an item with a TikTok flow starts that flow after the reply, instead of naming the picture", async () => {
    chatbotRow.ai_media_enabled = true;
    fetchAssets.mockResolvedValue([{ ...REVIEWS, tiktok_flow_ns: "content_reviews", tiktok_flow_name: "Reviews" }]);
    generate.mockResolvedValue({
      text: "Here's what clients say\n[[SEND_ASSET: reviews]]",
      tokensUsed: 9,
      finishReason: "stop",
      refused: false,
    });
    const body = await post(tiktok("can you show me results?"));
    expect(body.reply).toBe("Here's what clients say");
    // The owner's picture Conditions must not send it a second time.
    expect(body).not.toHaveProperty("media_key");
    expect(body).not.toHaveProperty("media_url");
    // Started after the response is back, so the reply text lands first.
    expect(sends.flow).not.toHaveBeenCalled();
    await runQueuedWithTimers();
    expect(sends.flow).toHaveBeenCalledWith({ subscriberId: "7", flowNs: "content_reviews", apiKey: "mc-test-key" });
    // The thread still records what went out.
    const sent = writes.filter((w) => w.table === "messages" && w.row.media_url);
    expect(sent.map((w) => w.row.content)).toEqual(["(sent image: reviews)"]);
  });

  it("an item's flow waits until every part of the reply has gone out", async () => {
    chatbotRow.ai_media_enabled = true;
    fetchAssets.mockResolvedValue([{ ...REVIEWS, tiktok_flow_ns: "content_reviews" }]);
    generate.mockResolvedValue({
      text: "Love that.\n\nHere's what clients say.\n\nTake a look\n[[SEND_ASSET: reviews]]",
      tokensUsed: 9,
      finishReason: "stop",
      refused: false,
    });
    const body = await post(tiktok("can you show me results?"));
    expect(body.reply_3).toBe("Take a look");
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      const done = runQueued();
      // Parts 2 and 3 each follow a 10-second Smart Delay in the owner's flow.
      await vi.advanceTimersByTimeAsync(20_000);
      expect(sends.flow).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(sends.flow).toHaveBeenCalledTimes(1);
      await done;
    } finally {
      vi.useRealTimers();
    }
  });

  it("a flow ManyChat refuses is recorded as a failed send, so it shows up in the no-reply checks", async () => {
    chatbotRow.ai_media_enabled = true;
    fetchAssets.mockResolvedValue([{ ...REVIEWS, tiktok_flow_ns: "content_gone" }]);
    generate.mockResolvedValue({ text: "Here you go\n[[SEND_ASSET: reviews]]", tokensUsed: 9, finishReason: "stop", refused: false });
    sends.flow.mockRejectedValue(new Error("ManyChat sendFlow failed: 400 flow not found"));
    await post(tiktok("can you show me results?"));
    await runQueuedWithTimers();
    const failed = writes.filter((w) => w.table === "usage_log" && w.row.event_type === "media_flow_failed");
    expect(failed).toHaveLength(1);
    expect(failed[0].row).toMatchObject({ user_id: "owner-1", chatbot_id: BOT_ID });
  });

  it("a keyword reply's item with a TikTok flow starts the flow, a video included", async () => {
    fetchAssets.mockResolvedValue([{ ...DEMO_VIDEO, tiktok_flow_ns: "content_demo" }]);
    chatbotRow.keyword_triggers = [
      {
        id: "g1",
        keywords: ["demo"],
        exclude: [],
        first_reply_mode: "message",
        first_reply_text: "Here's a quick demo!",
        first_reply_asset_key: "demo",
        on_repeat: "ai",
        enabled: true,
      },
    ];
    const body = await post(tiktok("demo"));
    expect(body).toMatchObject({ reason: "keyword_trigger", reply: "Here's a quick demo!" });
    expect(body).not.toHaveProperty("media_key");
    await runQueuedWithTimers();
    expect(sends.flow).toHaveBeenCalledWith({ subscriberId: "7", flowNs: "content_demo", apiKey: "mc-test-key" });
    expect(sends.media).not.toHaveBeenCalled();
  });

  it("(on Instagram an item's TikTok flow is ignored: the file is sent as before)", async () => {
    Object.assign(chatbotRow, { ai_media_enabled: true, reply_debounce_seconds: 0 });
    conversation!.platform = "instagram";
    fetchAssets.mockResolvedValue([{ ...REVIEWS, tiktok_flow_ns: "content_reviews" }]);
    generate.mockResolvedValue({ text: "Here you go\n[[SEND_ASSET: reviews]]", tokensUsed: 9, finishReason: "stop", refused: false });
    await post(instagram("can you show me results?"));
    await runQueued();
    const items = (sends.paced.mock.calls[0][0] as { items: { kind: string }[] }).items;
    expect(items.map((i) => i.kind)).toContain("media");
    expect(sends.flow).not.toHaveBeenCalled();
  });

  it("a picture the model attaches comes back as media_key and media_url, one per reply", async () => {
    chatbotRow.ai_media_enabled = true;
    fetchAssets.mockResolvedValue([REVIEWS, RESULTS]);
    generate.mockResolvedValue({
      text: "Here's what clients say\n[[SEND_ASSET: Reviews]]\n[[SEND_ASSET: results]]",
      tokensUsed: 9,
      finishReason: "stop",
      refused: false,
    });
    const body = await post(tiktok("can you show me results?"));
    expect(body.reply).toBe("Here's what clients say");
    // The library's own key, whatever case the model wrote it in.
    expect(body).toMatchObject({ media_key: "reviews", media_url: REVIEWS.url });
    expect(sends.media).not.toHaveBeenCalled();
    // Only the picture the flow sends is saved to the thread.
    const pictures = writes.filter((w) => w.table === "messages" && w.row.media_url);
    expect(pictures.map((w) => w.row.media_url)).toEqual([REVIEWS.url]);
  });

  it("a reply without a picture names none", async () => {
    chatbotRow.ai_media_enabled = true;
    fetchAssets.mockResolvedValue([REVIEWS]);
    const body = await post(tiktok("what does it cost?"));
    expect(body.reply).toBe(REPLY);
    expect(body).not.toHaveProperty("media_key");
    expect(body).not.toHaveProperty("media_url");
  });

  it("a keyword reply's picture comes back too, but not its video", async () => {
    const group = (asset: string) => ({
      id: "g1",
      keywords: ["reviews"],
      exclude: [],
      first_reply_mode: "message",
      first_reply_text: "Here are a few of our reviews!",
      first_reply_asset_key: asset,
      on_repeat: "ai",
      enabled: true,
    });
    fetchAssets.mockResolvedValue([REVIEWS, DEMO_VIDEO]);
    chatbotRow.keyword_triggers = [group("reviews")];
    const body = await post(tiktok("reviews"));
    expect(body).toMatchObject({
      reason: "keyword_trigger",
      reply: "Here are a few of our reviews!",
      reply_1: "Here are a few of our reviews!",
      media_key: "reviews",
      media_url: REVIEWS.url,
    });
    expect(sends.media).not.toHaveBeenCalled();

    chatbotRow.keyword_triggers = [group("demo")];
    conversation!.keyword_fired = [];
    const video = await post(tiktok("reviews"));
    expect(video.reason).toBe("keyword_trigger");
    expect(video).not.toHaveProperty("media_key");
  });

  it("(on Instagram the media library is still read)", async () => {
    Object.assign(chatbotRow, { ai_media_enabled: true, reply_debounce_seconds: 0 });
    conversation!.platform = "instagram";
    await post(instagram("can you show me results?"));
    await runQueued();
    expect(fetchAssets).toHaveBeenCalledTimes(1);
  });

  it("a link token the model writes anyway is stripped, and no link flow is fired", async () => {
    Object.assign(chatbotRow, {
      link_flow_enabled: true,
      link_flows: [{ token: "[[SEND_LINK]]", ns: "content_signup", name: "Signup" }],
    });
    generate.mockResolvedValue({ text: "Here's where you sign up\n[[SEND_LINK]]", tokensUsed: 9, finishReason: "stop", refused: false });
    const body = await post(tiktok("where do I sign up?"));
    await runQueued();
    expect(body.reply).toBe("Here's where you sign up");
    expect(sends.flow).not.toHaveBeenCalled();
  });
});

describe("the prompt on TikTok has no link tokens", () => {
  const bot = {
    id: "b1",
    name: "Test",
    tone: "friendly",
    link_flow_enabled: true,
    link_flows: [{ token: "[[SEND_LINK]]", ns: "content_signup", name: "Signup" }],
  } as unknown as Chatbot;
  const prompt = (platform: string | null) =>
    buildSystemPrompt(bot, "", null, false, null, null, null, null, null, { platform });

  it("TikTok: no LINK DELIVERY block, so the model writes the link as text", () => {
    expect(prompt("tiktok")).not.toContain("LINK DELIVERY");
    expect(prompt("tiktok")).not.toContain("[[SEND_LINK]]");
  });

  it("Instagram, and callers that name no channel, keep it", () => {
    expect(prompt("instagram")).toContain("LINK DELIVERY");
    expect(prompt(null)).toContain("LINK DELIVERY");
  });
});

describe("the prompt's media list on TikTok", () => {
  const bot = { id: "b1", name: "Test", tone: "friendly" } as unknown as Chatbot;
  const prompt = (platform: string | null) =>
    buildSystemPrompt(bot, "", null, false, "- reviews (image)", null, null, null, null, { platform });

  it("TikTok: one picture per reply, never a whole numbered set", () => {
    expect(prompt("tiktok")).toContain("ONE PER REPLY");
    expect(prompt("tiktok")).not.toContain("NUMBERED SETS");
  });

  it("Instagram, and callers that name no channel, keep numbered sets", () => {
    expect(prompt("instagram")).toContain("NUMBERED SETS");
    expect(prompt(null)).toContain("NUMBERED SETS");
    expect(prompt("instagram")).not.toContain("ONE PER REPLY");
  });
});
