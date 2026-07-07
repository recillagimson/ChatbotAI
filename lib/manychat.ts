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
import {
  type Platform,
  type MediaBlockKind,
  PLATFORM_META,
  DEFAULT_PLATFORM,
  canSendMediaKind,
} from "./platforms";
import type { FollowupAssetKind } from "./types";

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
// Link → URL-button rendering (ManyChat sendContent schema: a text message with
// a `buttons` array of {type:"url", caption, url}). Handles markdown [label](url)
// and bare URLs; platform limits: max 3 buttons/message, caption max ~20 chars.
//
// PLATFORM-AWARE. Instagram DMs do NOT render these buttons (button templates are
// a Messenger feature) — IG collapses them to text, and IG already auto-links raw
// URLs anyway. So buttons are used ONLY on Messenger (Facebook); Instagram and
// every other channel keep the raw (clickable) URL as text. Set
// LINK_BUTTONS_ENABLED=false to disable buttons everywhere (global kill switch).
const LINK_BUTTONS_DISABLED = process.env.LINK_BUTTONS_ENABLED === "false";
const BUTTON_PLATFORMS = new Set<Platform>(["messenger"]); // channels that render URL buttons

/** Whether to convert links to buttons on this channel (Messenger only, unless killed). */
export function buttonsSupported(platform?: Platform): boolean {
  if (LINK_BUTTONS_DISABLED) return false;
  return BUTTON_PLATFORMS.has(platform ?? DEFAULT_PLATFORM);
}
const MAX_BUTTONS = 3;
const MAX_BUTTON_CAPTION = 20;

export type ManyChatButton = { type: "url"; caption: string; url: string };
export type ManyChatTextMessage = { type: "text"; text: string; buttons?: ManyChatButton[] };
/** A media bubble (image/video/audio/file) — ManyChat fetches `url` at send time. */
export type ManyChatMediaMessage = { type: MediaBlockKind; url: string };
export type ManyChatOutMessage = ManyChatTextMessage | ManyChatMediaMessage;

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
export function messageWithLinkButtons(text: string): ManyChatTextMessage {
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

/**
 * Build the ManyChat `content.messages` array from reply bubbles. On Messenger
 * (Facebook) links become URL buttons; on Instagram and other channels the raw
 * (clickable) URL stays in the text.
 */
export function buildOutboundMessages(texts: string[], platform?: Platform): ManyChatTextMessage[] {
  if (!buttonsSupported(platform)) return texts.map((t) => ({ type: "text", text: t }));
  return texts.map(messageWithLinkButtons);
}

/** Resolve a platform's ManyChat content.type, throwing for no-send-API channels. */
function requireContentType(platform?: Platform): string {
  // Channels with no send API (manychatType=null, e.g. TikTok) must never reach here.
  const contentType = PLATFORM_META[platform ?? DEFAULT_PLATFORM].manychatType;
  if (!contentType) {
    throw new Error(
      `ManyChat has no send API for platform "${platform}" — deliver via the webhook response instead.`
    );
  }
  return contentType;
}

/**
 * Decide what to do after a `fetch` throw in postSendContent: retry it, or (for
 * media) assume it was delivered and stop. ANY thrown transport error is
 * ambiguous for media — a client timeout/abort OR a network error (e.g. an
 * ECONNRESET / premature close surfacing as a TypeError) that may have fired
 * AFTER ManyChat already relayed the asset. Re-POSTing risks a duplicate video,
 * which the owner ranks worse than a rare miss, so `assumeDeliveredOnError`
 * stops. (429/5xx never reach here — they don't throw — so postSendContent still
 * retries those: the server explicitly rejected the send, so it was NOT
 * delivered.) The permanent-4xx error is re-thrown by identity before this is
 * called. Pure + exported for scripts/test-manychat-retry.ts.
 */
export function classifySendError(
  err: unknown,
  opts: { assumeDeliveredOnError?: boolean }
): "assume_delivered" | "retry" {
  if (opts.assumeDeliveredOnError && err instanceof Error) return "assume_delivered";
  return "retry";
}

/**
 * Low-level: POST a prebuilt `messages[]` to ManyChat's Send Content API with
 * retries. Shared by the text (sendManychatMessage) and media (sendManychatMedia)
 * senders so both get identical transient-failure handling.
 *
 * Retry transient failures (429 / 5xx / network) so a ManyChat blip doesn't
 * silently drop a reply that's already saved to the DB. Other 4xx errors
 * (invalid subscriber, closed messaging window) are permanent — throw
 * immediately.
 *
 * Failure policy differs by content (see classifySendError): TEXT keeps the
 * "a doubled reply beats a dropped one" trade-off (retry on any transport error).
 * MEDIA passes `assumeDeliveredOnError` — a slow-but-successful video that trips a
 * transport error (our client timeout, or a network blip after ManyChat relayed
 * it) must NOT be re-POSTed, or the lead receives it twice; we assume it was
 * delivered and stop. Media also passes a longer `attemptTimeoutMs` so a genuine
 * video relay rarely trips the timeout in the first place.
 */
async function postSendContent(opts: {
  subscriberId: string;
  messages: ManyChatOutMessage[];
  contentType: string;
  apiKey: string;
  /** ManyChat message_tag for out-of-window sends (e.g. HUMAN_AGENT). Omitted = standard in-window send. */
  messageTag?: string;
  /** Per-attempt client timeout. Default 8s; media passes ~15s (video relay is slow). */
  attemptTimeoutMs?: number;
  /** When a send throws a transport error (timeout/network) AFTER the request was
   *  sent, assume delivered and stop instead of retrying (media only — a duplicate
   *  is worse than a rare miss). 429/5xx still retry (server rejected, not sent). */
  assumeDeliveredOnError?: boolean;
}) {
  const body = JSON.stringify({
    subscriber_id: opts.subscriberId,
    data: {
      version: "v2",
      content: { type: opts.contentType, messages: opts.messages },
    },
    ...(opts.messageTag ? { message_tag: opts.messageTag } : {}),
  });

  const ATTEMPTS = 3;
  const BACKOFF_MS = [1_000, 3_000];
  const ATTEMPT_TIMEOUT_MS = opts.attemptTimeoutMs ?? 8_000;
  let lastError: Error = new Error("ManyChat send failed: no attempts made");

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    let delayMs = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
    try {
      const res = await fetch("https://api.manychat.com/fb/sending/sendContent", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
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
      // Re-throw the permanent-4xx error constructed above.
      if (err === lastError) throw err;
      // Media: a transport error means the request was already sent — assume it
      // was delivered and stop rather than re-POST (no duplicate video). Text
      // falls through and retries.
      if (
        classifySendError(err, { assumeDeliveredOnError: opts.assumeDeliveredOnError }) ===
        "assume_delivered"
      ) {
        return { assumedDelivered: true };
      }
      lastError = new Error(
        `ManyChat send failed: ${err instanceof Error ? err.message : String(err)} (attempt ${attempt + 1}/${ATTEMPTS})`
      );
    }
    if (attempt < ATTEMPTS - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  throw lastError;
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
  const contentType = requireContentType(opts.platform);

  // Normalize to a list of non-empty bubbles. Nothing to send → no-op (also
  // avoids posting a blank message when an empty string is passed).
  // sanitizeReply is the final guaranteed backstop: every outbound bubble from
  // any path (AI reply, canned ack, dedup echo) is stripped of em/en dashes
  // here so none ever reaches Instagram.
  const texts = (Array.isArray(opts.text) ? opts.text : [opts.text])
    .map((t) => sanitizeReply((t ?? "").trim()))
    .filter(Boolean);
  if (texts.length === 0) return null;

  return postSendContent({
    subscriberId: opts.subscriberId,
    messages: buildOutboundMessages(texts, opts.platform),
    contentType,
    apiKey: opts.apiKey,
    messageTag: opts.messageTag,
  });
}

/** A media/link asset to push: its kind + a public HTTPS URL. */
export interface OutboundAsset {
  kind: FollowupAssetKind; // image | video | audio | link
  url: string;
}

/**
 * Send media assets (+ an optional text caption) as one ManyChat message.
 *
 * Channel-aware: image/video/audio assets become native media bubbles ONLY on
 * channels that accept them (Instagram = image only; Messenger/Telegram = all).
 * An unsupported media asset (e.g. a voice note on Instagram) is dropped — the
 * text caption still delivers so nothing is lost. `link` assets are appended to
 * the caption as a raw URL (sent as text on every channel). Returns null when
 * there is nothing deliverable (no supported media and no text).
 *
 * Ordering: the caption bubble is sent first, then the media bubble(s), so a
 * "sending you a quick video 👇" caption introduces the asset.
 */
export async function sendManychatMedia(opts: {
  subscriberId: string;
  assets: OutboundAsset[];
  text?: string | null;
  messageTag?: string;
  apiKey: string;
  platform?: Platform;
}): Promise<unknown> {
  const contentType = requireContentType(opts.platform);
  const platform = opts.platform ?? DEFAULT_PLATFORM;

  const mediaBlocks: ManyChatMediaMessage[] = [];
  const linkUrls: string[] = [];
  for (const asset of opts.assets) {
    if (!asset?.url) continue;
    if (asset.kind === "link") {
      linkUrls.push(asset.url);
    } else if (canSendMediaKind(platform, asset.kind)) {
      // image/video/audio -> native bubble (kind names map 1:1 to block types)
      mediaBlocks.push({ type: asset.kind, url: asset.url });
    }
    // else: unsupported media on this channel -> dropped; caption carries it
  }

  // Caption + any link assets fold into one text bubble (links kept raw so they
  // stay clickable on channels that render them; IG may strip them — accepted).
  const captionParts = [sanitizeReply((opts.text ?? "").trim()), ...linkUrls].filter(Boolean);
  const caption = captionParts.join("\n").trim();

  if (mediaBlocks.length === 0 && !caption) return null;

  const messages: ManyChatOutMessage[] = [];
  if (caption) messages.push(...buildOutboundMessages([caption], platform));
  messages.push(...mediaBlocks);

  return postSendContent({
    subscriberId: opts.subscriberId,
    messages,
    contentType,
    apiKey: opts.apiKey,
    messageTag: opts.messageTag,
    // Media prefers a rare drop over a duplicate: give a video time to relay, and
    // never re-POST after a transport error (a slow-but-delivered video would
    // double up). 429/5xx still retry (server rejected it, so it wasn't sent).
    attemptTimeoutMs: 15_000,
    assumeDeliveredOnError: true,
  });
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
