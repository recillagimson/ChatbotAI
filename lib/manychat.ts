/**
 * ManyChat integration helpers.
 *
 * Architecture:
 *  1. In ManyChat, the customer sets up an automation that, on any new IG/Messenger
 *     message, calls our External Request endpoint: POST /api/webhooks/manychat
 *  2. ManyChat sends the subscriber + message text + a shared secret header.
 *  3. We generate an AI reply with Claude and return it in the response body.
 *  4. ManyChat's "Set Custom Field" action stores our reply, then "Send Message"
 *     sends it back to the user. (Configured in the ManyChat flow.)
 *
 * Optionally we can also push messages via the ManyChat Send Content API
 * (https://api.manychat.com/fb/sending/sendContent), but the External Request
 * round-trip is simpler and what most setty.ai-style products use.
 */

import { createHash, timingSafeEqual } from "crypto";
import { sanitizeReply } from "./sanitize";
import { decryptSecret } from "./crypto";
import { type Platform, PLATFORM_META, DEFAULT_PLATFORM } from "./platforms";

/** Thrown when a chatbot's ManyChat API key can't be resolved. */
export class ManychatKeyError extends Error {
  constructor(public code: "manychat_key_decrypt_failed" | "no_manychat_api_key") {
    super(code);
    this.name = "ManychatKeyError";
  }
}

/**
 * Resolve the ManyChat API key for a chatbot.
 * - If the chatbot has an encrypted key, decrypt it. A decryption failure
 *   (bad/rotated master key) is a HARD error — never fall back to the global
 *   env key, which would send this tenant's reply through the owner's account.
 * - Otherwise fall back to the global MANYCHAT_API_KEY (the un-migrated owner).
 * - Throw ManychatKeyError if neither is available.
 */
export function resolveManychatApiKey(chatbot: {
  manychat_api_key_enc?: string | null;
}): string {
  if (chatbot.manychat_api_key_enc) {
    try {
      return decryptSecret(chatbot.manychat_api_key_enc);
    } catch {
      throw new ManychatKeyError("manychat_key_decrypt_failed");
    }
  }
  const env = process.env.MANYCHAT_API_KEY;
  if (!env) throw new ManychatKeyError("no_manychat_api_key");
  return env;
}

export interface ManyChatWebhookPayload {
  /** ManyChat subscriber id (string) */
  subscriber_id: string;
  /** ManyChat page id (links to a chatbot in our DB) */
  page_id: string;
  /** First name from ManyChat profile */
  first_name?: string;
  /** Last name from ManyChat profile */
  last_name?: string;
  /** Instagram or Messenger username */
  username?: string;
  /** The latest user message text */
  message: string;
}

/** Constant-time compare of the shared webhook secret against an expected
 *  value (per-chatbot secret), defaulting to the env var for back-compat. */
export function verifyManychatSecret(
  provided: string | null,
  expected?: string | null
): boolean {
  const exp = expected ?? process.env.MANYCHAT_WEBHOOK_SECRET;
  if (!exp || !provided) return false;
  const a = createHash("sha256").update(exp).digest();
  const b = createHash("sha256").update(provided).digest();
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Actively send a message back to the user via ManyChat's Send Content API.
 *
 * This is our PRIMARY delivery mechanism. ManyChat's "Get Dynamic Content"
 * (rendering the External Request response inline) is unreliable on Instagram —
 * it silently drops the reply. So instead the flow is a fire-and-forget
 * External Request, and we push the reply here.
 *
 * Notes:
 *  - `content.type: "instagram"` is required for IG delivery (verified: a bare
 *    payload without it is rejected; with it, ManyChat returns success).
 *  - No `message_tag`: replies are sent within seconds of the customer's
 *    message, always inside Instagram's 24-hour standard messaging window, so
 *    no tag is needed (and ACCOUNT_UPDATE is a Messenger-only tag anyway).
 */
// ---------------------------------------------------------------------------
// Link → button conversion
// ---------------------------------------------------------------------------
// Raw links in an automated IG/Messenger DM look spammy and are often stripped.
// Instead we render links as tappable URL buttons (ManyChat sendContent schema:
// a text message with a `buttons` array of {type:"url", caption, url}). Handles
// both markdown [label](url) and bare URLs. Platform limits: max 3 buttons per
// message, button caption max ~20 chars. Toggle with LINK_BUTTONS_ENABLED=false.
const LINK_BUTTONS_ENABLED = process.env.LINK_BUTTONS_ENABLED !== "false"; // default on
const MAX_BUTTONS = 3;
const MAX_BUTTON_CAPTION = 20;

export type ManyChatButton = { type: "url"; caption: string; url: string };
export type ManyChatOutMessage = { type: "text"; text: string; buttons?: ManyChatButton[] };

const MD_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
const BARE_URL_RE = /https?:\/\/[^\s)]+/g;

function clampCaption(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > MAX_BUTTON_CAPTION ? t.slice(0, MAX_BUTTON_CAPTION).trim() : t;
}

/**
 * Turn one reply bubble into a ManyChat message, converting links to URL buttons.
 * Markdown `[label](url)` keeps its label inline and adds a button captioned with
 * the label; bare URLs are removed from the text and become an "Open link" button.
 * No links → plain text message. Pure + unit-tested.
 */
export function messageWithLinkButtons(text: string): ManyChatOutMessage {
  const buttons: ManyChatButton[] = [];
  let out = text.replace(MD_LINK_RE, (_m, label: string, url: string) => {
    if (buttons.length < MAX_BUTTONS) buttons.push({ type: "url", caption: clampCaption(label) || "Open link", url });
    return label; // keep the label inline so the sentence still reads
  });
  out = out.replace(BARE_URL_RE, (url) => {
    if (buttons.length < MAX_BUTTONS) buttons.push({ type: "url", caption: "Open link", url });
    return ""; // drop the raw URL from the text; the button carries it
  });
  if (buttons.length === 0) return { type: "text", text };
  out = out.replace(/[ \t]{2,}/g, " ").replace(/ +\n/g, "\n").trim();
  return { type: "text", text: out || "Here you go 👇", buttons };
}

/** Build the ManyChat `content.messages` array from reply bubbles. */
export function buildOutboundMessages(texts: string[]): ManyChatOutMessage[] {
  if (!LINK_BUTTONS_ENABLED) return texts.map((t) => ({ type: "text", text: t }));
  return texts.map(messageWithLinkButtons);
}

export async function sendManychatMessage(opts: {
  subscriberId: string;
  /**
   * Reply text. Pass a string for a single bubble, or an array to send several
   * separate DM bubbles in one call (each element renders as its own message).
   */
  text: string | string[];
  /** Instagram message tag for sending outside the 24h window (e.g. "HUMAN_AGENT"). */
  messageTag?: string;
  /** ManyChat API key to authenticate the send (resolved per-chatbot by the caller). */
  apiKey: string;
  /** Channel the contact is on; sets ManyChat's content.type. Defaults to Instagram. */
  platform?: Platform;
}) {
  const { apiKey } = opts;
  // content.type is the ManyChat channel key (instagram/messenger/whatsapp/telegram).
  // Channels with no send API (manychatType=null, e.g. TikTok) must never reach here.
  const contentType = PLATFORM_META[opts.platform ?? DEFAULT_PLATFORM].manychatType;
  if (!contentType) {
    throw new Error(
      `ManyChat has no send API for platform "${opts.platform}" — deliver via the webhook response instead.`
    );
  }

  // Normalize to a list of non-empty bubbles. Nothing to send → no-op (also
  // avoids posting a blank message when an empty string is passed).
  // sanitizeReply is the final guaranteed backstop: every outbound bubble from
  // any path (AI reply, canned ack, dedup echo) is stripped of em/en dashes
  // here so none ever reaches Instagram.
  const texts = (Array.isArray(opts.text) ? opts.text : [opts.text])
    .map((t) => sanitizeReply((t ?? "").trim()))
    .filter(Boolean);
  if (texts.length === 0) return null;

  const body = JSON.stringify({
    subscriber_id: opts.subscriberId,
    data: {
      version: "v2",
      content: {
        type: contentType,
        messages: buildOutboundMessages(texts),
      },
    },
  });

  // Retry transient failures (429 / 5xx / network) so a ManyChat blip doesn't
  // silently drop a reply that's already saved to the DB. Other 4xx errors
  // (invalid subscriber, closed messaging window) are permanent — throw
  // immediately. Worst case 3×8s attempts + 1s+3s backoff = 28s, which fits
  // the webhook's 60s budget after the AI call. Trade-off: if ManyChat accepts
  // a request but our 8s abort fires before the response arrives, the retry
  // double-delivers — a doubled reply beats a dropped one.
  const ATTEMPTS = 3;
  const BACKOFF_MS = [1_000, 3_000];
  const ATTEMPT_TIMEOUT_MS = 8_000;
  let lastError: Error = new Error("ManyChat send failed: no attempts made");

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    let delayMs = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
    try {
      const res = await fetch("https://api.manychat.com/fb/sending/sendContent", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });

      if (res.ok) return res.json();

      const errText = await res.text().catch(() => "");
      lastError = new Error(
        `ManyChat send failed: ${res.status} ${errText} (attempt ${attempt + 1}/${ATTEMPTS})`
      );
      if (res.status !== 429 && res.status < 500) throw lastError; // permanent
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after"));
        if (Number.isFinite(retryAfter) && retryAfter > 0) {
          delayMs = Math.min(retryAfter * 1_000, ATTEMPT_TIMEOUT_MS);
        }
      }
    } catch (err) {
      // fetch threw: network error or our abort. Both transient — retry.
      // But re-throw the permanent-4xx error constructed above.
      if (err === lastError) throw err;
      lastError = new Error(
        `ManyChat send failed: ${err instanceof Error ? err.message : String(err)} (attempt ${attempt + 1}/${ATTEMPTS})`
      );
    }
    if (attempt < ATTEMPTS - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Human-like bubble pacing
// ---------------------------------------------------------------------------
// We delay before EVERY bubble (including a lone single-bubble reply) so a reply
// never lands the instant the AI finishes — it arrives like a person who read the
// DM, then typed. The pause before each bubble scales with that bubble's length
// (you type a longer message longer). Tunables are env-overridable with sane
// defaults. Total pacing is hard-capped so it never threatens the 60s webhook
// budget or a ManyChat External Request timeout.
const PACING_ENABLED = process.env.BUBBLE_PACING_ENABLED !== "false"; // default on
const READ_MS = 900; // base "saw the DM and started typing" pause before bubble 1
const PER_CHAR_MS = 24; // typing-speed feel (~per character)
const FIRST_MIN_MS = 1_200; // a real reply never lands instantly
const FIRST_MAX_MS = 4_000; // cap composing time even for a long first bubble
const MIN_GAP_MS = 700; // floor for gaps before later bubbles
const MAX_GAP_MS = 2_500; // ceiling for gaps before later bubbles
const MAX_TOTAL_PACING_MS = 9_000; // sum of all delays; scaled down if exceeded
const PACING_DEADLINE_MS = 45_000; // if the request is already this old, stop sleeping
// "Thinking" pause: the first reply bubble lands at least this long after the
// customer's message, so the bot reads as a person who paused to think. Measured
// from request start, so AI-generation time counts toward it (no stacking).
// Env-overridable; set REPLY_THINKING_MS=0 to disable.
const THINKING_MS = Number(process.env.REPLY_THINKING_MS ?? 5_000);

/** True if bubble pacing is on (default). Set BUBBLE_PACING_ENABLED=false to disable. */
export function pacingEnabled(): boolean {
  return PACING_ENABLED;
}

/**
 * Pure: extra ms to wait before the first bubble so the reply lands ~thinkingMs
 * after the customer's message, accounting for time already elapsed (mostly AI
 * generation). Never negative. Exported for unit testing.
 */
export function thinkingDelayMs(elapsedMs: number, thinkingMs: number = THINKING_MS): number {
  return Math.max(0, thinkingMs - elapsedMs);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Pure: compute the "typing" delay (ms) to wait BEFORE sending each bubble.
 * - Bubble 0 gets a read pause + length-scaled composing time (FIRST_MIN..FIRST_MAX),
 *   so even a single-bubble reply has a believable typing delay.
 * - Later bubbles get a length-scaled gap (MIN_GAP..MAX_GAP) so they drip in.
 * The total is scaled down proportionally to stay within MAX_TOTAL_PACING_MS.
 * Exported for unit testing (deterministic, no I/O).
 */
export function computeBubbleDelays(bubbles: string[]): number[] {
  const lens = bubbles.map((b) => (b ?? "").trim().length);
  const raw = lens.map((len, i) =>
    i === 0
      ? clamp(READ_MS + len * PER_CHAR_MS, FIRST_MIN_MS, FIRST_MAX_MS)
      : clamp(len * PER_CHAR_MS, MIN_GAP_MS, MAX_GAP_MS)
  );
  const total = raw.reduce((a, b) => a + b, 0);
  const scale = total > MAX_TOTAL_PACING_MS ? MAX_TOTAL_PACING_MS / total : 1;
  return raw.map((g) => Math.round(g * scale));
}

/**
 * Deliver a reply with short, human-like typing delays so it "drips in" instead
 * of landing all at once the instant the AI finishes. Each bubble is its own
 * sendContent call (reusing sendManychatMessage for per-call sanitize + retry).
 * Delays come from computeBubbleDelays (length-scaled, capped); sleeps are skipped
 * once the request passes PACING_DEADLINE_MS so we never blow the 60s budget.
 * Every bubble is always attempted — a single failure is logged and the rest still
 * send; throws once at the end if any failed so the caller can record push_failed.
 */
export async function sendManychatMessagePaced(opts: {
  subscriberId: string;
  bubbles: string[];
  messageTag?: string;
  startedAt?: number; // performance.now() at request start, for the deadline guard
  /** ManyChat API key to authenticate each send (resolved per-chatbot by the caller). */
  apiKey: string;
  /** Channel the contact is on; forwarded to each sendContent call. */
  platform?: Platform;
}): Promise<void> {
  const bubbles = opts.bubbles.map((b) => (b ?? "").trim()).filter(Boolean);
  if (bubbles.length === 0) return;

  const gaps = computeBubbleDelays(bubbles);

  const startedAt = opts.startedAt ?? performance.now();
  let anyFailed = false;

  for (let i = 0; i < bubbles.length; i++) {
    // Bubble 0 also waits out the "thinking" pause so the reply lands ~THINKING_MS
    // after the customer's message (minus time already spent generating). Later
    // bubbles just use their length-scaled drip gap.
    const elapsed = performance.now() - startedAt;
    const wait = i === 0 ? Math.max(gaps[i], thinkingDelayMs(elapsed)) : gaps[i];
    // Skip the pause if the request is already old (protect the 60s budget);
    // we still send every bubble, just without the gap.
    if (wait > 0 && elapsed < PACING_DEADLINE_MS) {
      await sleep(wait);
    }
    try {
      await sendManychatMessage({
        subscriberId: opts.subscriberId,
        text: bubbles[i],
        messageTag: opts.messageTag,
        apiKey: opts.apiKey,
        platform: opts.platform,
      });
    } catch (err) {
      anyFailed = true;
      console.error(
        `[manychat] paced bubble ${i + 1}/${bubbles.length} failed`,
        err
      );
    }
  }

  if (anyFailed) throw new Error("ManyChat paced send: one or more bubbles failed");
}

/**
 * Validate a ManyChat API key by calling getInfo. Returns the page name on
 * success so the UI can confirm which account was connected.
 */
export async function validateManychatApiKey(
  apiKey: string
): Promise<{ ok: boolean; pageName?: string; error?: string }> {
  try {
    const res = await fetch("https://api.manychat.com/fb/page/getInfo", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8_000),
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.status === "success") {
      return { ok: true, pageName: json?.data?.name ?? undefined };
    }
    return { ok: false, error: json?.message || `ManyChat returned ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
}
