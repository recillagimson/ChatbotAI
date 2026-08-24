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
 *   (bad/rotated master key) is a HARD error - never fall back to the global
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
 * (rendering the External Request response inline) is unreliable on Instagram -
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
// Link buttons are OFF BY DEFAULT for every client - the default delivers links as
// plain text, each isolated onto its own bubble (see buildOutboundMessages), with the
// FULL URL (query string included) intact. A raw URL is clickable on every channel
// anyway, and plain text can never drop an affiliate "?ref=..." param.
//
// Opt IN per-chatbot with the `link_buttons_enabled` column (threaded here as the
// `enabled` arg) - that bot's Messenger links then render as tappable URL buttons.
// The legacy LINK_BUTTONS_ENABLED env var still works as a GLOBAL override (turns
// buttons on for every bot at once). Either switch only affects Messenger: Instagram
// has no URL buttons (and strips links), so buttonsSupported is false off-Messenger.
const LINK_BUTTONS_ENABLED = process.env.LINK_BUTTONS_ENABLED === "true";
const BUTTON_PLATFORMS = new Set<Platform>(["messenger"]); // channels that render URL buttons

/**
 * Whether to convert links to buttons on this channel. Messenger only, and only when
 * this bot opted in (`enabled`, from chatbots.link_buttons_enabled) OR the global
 * LINK_BUTTONS_ENABLED env override is set.
 */
export function buttonsSupported(platform?: Platform, enabled?: boolean): boolean {
  if (!BUTTON_PLATFORMS.has(platform ?? DEFAULT_PLATFORM)) return false;
  return enabled === true || LINK_BUTTONS_ENABLED;
}
const MAX_BUTTONS = 3;
const MAX_BUTTON_CAPTION = 20;

export type ManyChatButton = { type: "url"; caption: string; url: string };
export type ManyChatTextMessage = { type: "text"; text: string; buttons?: ManyChatButton[] };
/** A media bubble (image/video/audio/file) - ManyChat fetches `url` at send time. */
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
 * Split one reply bubble so every link sits on its OWN bubble, separated from the
 * surrounding sentence - the default outbound link style for all channels/clients.
 * Markdown `[label](url)` keeps the label inline and isolates the url; trailing
 * sentence punctuation is peeled off the link so it stays clickable; the FULL URL
 * (query string included) is preserved verbatim. A bubble with no link returns
 * `[itself]`. Pure + unit-tested.
 */
export function isolateLinkBubbles(text: string): string[] {
  const t = (text ?? "")
    // Markdown [label](url) -> "label url " - the TRAILING space matters: without it,
    // back-to-back links "[a](u1)[b](u2)" would fuse "b" onto u1 and corrupt the URL.
    .replace(MD_LINK_RE, (_m, label: string, url: string) => `${label} ${url} `)
    .trim();
  if (!t) return [];
  const out: string[] = [];
  // Push a text fragment, dropping residue that is ONLY punctuation/brackets - the
  // leftover of isolating a wrapped URL, so "(https://x)" never emits a lone "(" bubble.
  // Emojis and real words are kept (they aren't in the punctuation class).
  const pushText = (s: string) => {
    const v = s.trim();
    if (v && !/^[\s()[\]{}<>.,!?;:'"|]+$/.test(v)) out.push(v);
  };
  const re = /https?:\/\/[^\s<>()]+/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    let url = m[0];
    const trail = url.match(/[.,!?;:'")\]]+$/)?.[0] ?? "";
    if (trail) url = url.slice(0, -trail.length);
    // Strip a wrapping open-bracket the writer put right before the URL ("… (").
    pushText(t.slice(last, m.index).replace(/[([{]\s*$/, ""));
    out.push(url);
    last = m.index + m[0].length;
  }
  // Strip a wrapping close-bracket left right after the URL (")").
  pushText(t.slice(last).replace(/^\s*[)\]}]/, ""));
  return out.length ? out : [t];
}

/**
 * Build the ManyChat `content.messages` array from reply bubbles. Default (all
 * clients, every channel): raw clickable links, each isolated onto its own bubble so
 * the link is never truncated and reads separated from the message. Opt-in per bot:
 * when `enabled` (chatbots.link_buttons_enabled) is true - or the global
 * LINK_BUTTONS_ENABLED env override is set - Messenger links render as URL buttons.
 */
export function buildOutboundMessages(
  texts: string[],
  platform?: Platform,
  enabled?: boolean
): ManyChatTextMessage[] {
  if (buttonsSupported(platform, enabled)) return texts.map(messageWithLinkButtons);
  return texts.flatMap(isolateLinkBubbles).map((t) => ({ type: "text", text: t }));
}

/** Resolve a platform's ManyChat content.type, throwing for no-send-API channels. */
function requireContentType(platform?: Platform): string {
  // Channels with no send API (manychatType=null, e.g. TikTok) must never reach here.
  const contentType = PLATFORM_META[platform ?? DEFAULT_PLATFORM].manychatType;
  if (!contentType) {
    throw new Error(
      `ManyChat has no send API for platform "${platform}" - deliver via the webhook response instead.`
    );
  }
  return contentType;
}

/**
 * Decide what to do after a `fetch` throw in postSendContent: retry it, or (for
 * media) assume it was delivered and stop. ANY thrown transport error is
 * ambiguous for media - a client timeout/abort OR a network error (e.g. an
 * ECONNRESET / premature close surfacing as a TypeError) that may have fired
 * AFTER ManyChat already relayed the asset. Re-POSTing risks a duplicate video,
 * which the owner ranks worse than a rare miss, so `assumeDeliveredOnError`
 * stops. (429/5xx never reach here - they don't throw - so postSendContent still
 * retries those: the server explicitly rejected the send, so it was NOT
 * delivered.) The permanent-4xx error is re-thrown by identity before this is
 * called. Pure + exported for scripts/test-manychat-retry.ts.
 */
export function classifySendError(
  err: unknown,
  opts: { assumeDeliveredOnError?: boolean }
): "assume_delivered" | "retry" {
  if (!(err instanceof Error)) return "retry";
  // Media (assumeDeliveredOnError): ANY transport error is ambiguous (the request
  // was already sent) → never re-POST a video/image; assume delivered.
  if (opts.assumeDeliveredOnError) return "assume_delivered";
  // Text: a client TIMEOUT/ABORT means our fetch was aborted AFTER the request went
  // out - ManyChat may well have delivered the DM already, so re-POSTing would deliver
  // a DUPLICATE. Assume delivered and stop. A connection-level failure (e.g. a
  // TypeError "fetch failed") means the request likely never completed → safe to retry
  // (it was not delivered). 429/5xx are handled in postSendContent (server rejected).
  if (err.name === "TimeoutError" || err.name === "AbortError") return "assume_delivered";
  return "retry";
}

/**
 * ManyChat's Send Content API returns HTTP 200 even for business-logic REFUSALS
 * (a closed 24h messaging window, "can't message this user", an account-level
 * messaging restriction) - the real outcome is the body's `status` field, exactly
 * like every other ManyChat endpoint (see validateManychatApiKey/listManychatFlows).
 * Treating a bare HTTP 200 as delivered persists a phantom "sent" bubble that never
 * reached the contact. Returns the refusal message when the body says error, else
 * null (delivered / unknown-but-ok). Pure + unit-tested.
 */
export function manychatSendRejection(json: unknown): string | null {
  const o = (json ?? null) as { status?: unknown; message?: unknown } | null;
  if (o && typeof o.status === "string" && o.status.toLowerCase() !== "success") {
    return typeof o.message === "string" && o.message.trim()
      ? o.message.trim()
      : "ManyChat rejected the send (status != success)";
  }
  return null;
}

/**
 * Low-level: POST a prebuilt `messages[]` to ManyChat's Send Content API with
 * retries. Shared by the text (sendManychatMessage) and media (sendManychatMedia)
 * senders so both get identical transient-failure handling.
 *
 * Retry transient failures (429 / 5xx / network) so a ManyChat blip doesn't
 * silently drop a reply that's already saved to the DB. Other 4xx errors
 * (invalid subscriber, closed messaging window) are permanent - throw
 * immediately.
 *
 * Failure policy differs by content (see classifySendError). TEXT treats a client
 * TIMEOUT/ABORT as delivered (the request was already sent - re-POSTing would double
 * the reply, the exact "same message twice" bug), and only retries connection-level
 * failures (request never completed) plus 429/5xx (server rejected → not delivered).
 * MEDIA passes `assumeDeliveredOnError` - a slow-but-successful video that trips ANY
 * transport error must NOT be re-POSTed, or the lead receives it twice; assume it was
 * delivered and stop. Both text and media use a 15s default `attemptTimeoutMs` so a
 * normal-but-slow ManyChat relay completes cleanly instead of tripping the timeout.
 */
async function postSendContent(opts: {
  subscriberId: string;
  messages: ManyChatOutMessage[];
  contentType: string;
  apiKey: string;
  /** ManyChat message_tag for out-of-window sends (e.g. HUMAN_AGENT). Omitted = standard in-window send. */
  messageTag?: string;
  /** Per-attempt client timeout. Default 15s so a normal-but-slow ManyChat relay
   *  responds before we abort (aborting mid-flight risks a duplicate re-POST). */
  attemptTimeoutMs?: number;
  /** When a send throws a transport error (timeout/network) AFTER the request was
   *  sent, assume delivered and stop instead of retrying (media only - a duplicate
   *  is worse than a rare miss). 429/5xx still retry (server rejected, not sent).
   *  NOTE: even without this flag, text now assumes-delivered on a TIMEOUT/ABORT
   *  specifically (see classifySendError) - this flag additionally covers connection
   *  errors, which text still retries. */
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
  const ATTEMPT_TIMEOUT_MS = opts.attemptTimeoutMs ?? 15_000;
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

      if (res.ok) {
        // HTTP 200 is necessary but NOT sufficient - ManyChat signals a refused send
        // (closed window, blocked user, account restriction) with status:"error" in
        // the 200 body. Surface it as a failure so the caller doesn't record a phantom
        // "sent" bubble, and so the reply can be retried/reconciled instead of lost.
        const json = await res.json().catch(() => null);
        const rejection = manychatSendRejection(json);
        if (rejection) {
          lastError = new Error(
            `ManyChat send refused (HTTP 200): ${rejection} (attempt ${attempt + 1}/${ATTEMPTS})`
          );
          // ManyChat evaluated the send and said no - this is a decision, not a transport
          // blip, so re-POSTing won't help and risks a duplicate. Treat as permanent.
          throw lastError;
        }
        return json ?? {};
      }

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
      // Media: a transport error means the request was already sent - assume it
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
  /** Per-chatbot opt-in (chatbots.link_buttons_enabled): render Messenger links as URL buttons. */
  linkButtons?: boolean;
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
    messages: buildOutboundMessages(texts, opts.platform, opts.linkButtons),
    contentType,
    apiKey: opts.apiKey,
    messageTag: opts.messageTag,
  });
}

/**
 * ManyChat subscriber-tag endpoints. Pure so the on→add / off→remove mapping is
 * unit-testable (scripts/test-manychat-retry.ts).
 */
export function tagEndpoint(on: boolean): string {
  return on
    ? "https://api.manychat.com/fb/subscriber/addTagByName"
    : "https://api.manychat.com/fb/subscriber/removeTagByName";
}

/**
 * Add (`on: true`) or remove (`on: false`) a ManyChat tag on a subscriber by name.
 * Used to mirror SpeedSettr's "stop follow-up" verdict to ManyChat (lib/followup-flag.ts)
 * so a native drip can Condition on the tag. This is a non-message write (no 24h
 * window concern, no message_tag).
 *
 * BEST-EFFORT: never throws. Retries 429/5xx and transport errors a couple of
 * times; a permanent 4xx or exhausted retries resolve to `false` (logged). Adding
 * an existing tag / removing an absent one is a ManyChat no-op, so a redundant call
 * is harmless.
 */
export async function setSubscriberTag(opts: {
  subscriberId: string;
  tagName: string;
  on: boolean;
  apiKey: string;
}): Promise<boolean> {
  const endpoint = tagEndpoint(opts.on);
  const body = JSON.stringify({ subscriber_id: opts.subscriberId, tag_name: opts.tagName });
  const ATTEMPTS = 3;
  const BACKOFF_MS = [1_000, 3_000];
  const TIMEOUT_MS = 8_000;
  let lastReason = "";

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          "Content-Type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return true;
      // Permanent client error (except 429) → give up.
      if (res.status !== 429 && res.status < 500) {
        console.error(
          `[manychat] setSubscriberTag ${res.status}`,
          await res.text().catch(() => "")
        );
        return false;
      }
      // 429 / 5xx → fall through to retry.
      lastReason = `status ${res.status}`;
    } catch (err) {
      // Transport error → retry (this is not a message send, so no duplicate risk).
      lastReason = err instanceof Error ? err.message : String(err);
    }
    if (attempt < ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]));
    }
  }
  console.error(
    `[manychat] setSubscriberTag exhausted retries (${opts.on ? "add" : "remove"} ${opts.tagName}): ${lastReason}`
  );
  return false;
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
 * An unsupported media asset (e.g. a voice note on Instagram) is dropped - the
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
  /** Per-chatbot opt-in (chatbots.link_buttons_enabled): render Messenger caption links as URL buttons. */
  linkButtons?: boolean;
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
  // stay clickable on channels that render them; IG may strip them - accepted).
  const captionParts = [sanitizeReply((opts.text ?? "").trim()), ...linkUrls].filter(Boolean);
  const caption = captionParts.join("\n").trim();

  if (mediaBlocks.length === 0 && !caption) return null;

  const messages: ManyChatOutMessage[] = [];
  if (caption) messages.push(...buildOutboundMessages([caption], platform, opts.linkButtons));
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
// The first bubble lands fast (a person who read the DM and started typing), then
// any follow-on bubbles TRICKLE in, spaced by how long THAT bubble is to "type":
// a short message waits ~10s, a long one up to ~30s (length-scaled, clamped).
// Bubble-0 timing is unchanged (read pause + short composing + the THINKING_MS
// floor); the trickle is the length-scaled gap before bubbles 2..N. All tunables
// are env-overridable. The total sleep time is fit under a budget at send time (see
// sendManychatMessagePaced / pacingFits) so it never exceeds the webhook's
// maxDuration - on Vercel Pro (maxDuration=300) the full 10–30s trickle fits even
// for a 6-bubble reply; on the 60s Hobby budget long replies pace what fits and send
// the remainder immediately (never dropped).

/** Read a non-negative-number env var, falling back to `dflt` when unset/invalid. */
function readMsEnv(name: string, dflt: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : dflt;
}

const PACING_ENABLED = process.env.BUBBLE_PACING_ENABLED !== "false"; // default on
const READ_MS = 900; // base "saw the DM and started typing" pause before bubble 1
const PER_CHAR_MS = 24; // typing-speed feel (~per character) for bubble 0
const FIRST_MIN_MS = 1_200; // a real reply never lands instantly
const FIRST_MAX_MS = 4_000; // cap composing time even for a long first bubble
// Length-scaled gap before each LATER bubble: gap = len * BUBBLE_GAP_PER_CHAR_MS,
// clamped to [BUBBLE_GAP_MIN_MS, BUBBLE_GAP_MAX_MS] - a short bubble waits the 10s
// floor, a long one up to the 30s ceiling. All three are env-tunable.
const BUBBLE_GAP_MIN_MS = readMsEnv("BUBBLE_GAP_MIN_MS", 10_000);
const BUBBLE_GAP_MAX_MS = Math.max(
  BUBBLE_GAP_MIN_MS,
  readMsEnv("BUBBLE_GAP_MAX_MS", 30_000)
); // floor max at min so a mis-set env can't invert the range
// Per-character "typing" rate for later bubbles. Default 150ms/char reaches the 30s
// ceiling at ~200 chars and the 10s floor at ≤~67 chars - tune to taste.
const BUBBLE_GAP_PER_CHAR_MS = readMsEnv("BUBBLE_GAP_PER_CHAR_MS", 150);
// Total sleep budget: a bubble's gap is only slept if it FINISHES at/under this, so
// cumulative pacing never overshoots the function's maxDuration. Sized for Vercel
// Pro (maxDuration=300) by default; lower it to ~50_000 if you run on the 60s budget.
const BUBBLE_PACING_BUDGET_MS = readMsEnv("BUBBLE_PACING_BUDGET_MS", 280_000);
// Absolute hard stop: once the request is this old, skip all remaining sleeps. Kept
// just under maxDuration as a belt-and-suspenders guard alongside the budget.
const PACING_DEADLINE_MS = readMsEnv("PACING_DEADLINE_MS", 290_000);
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
 * Pure: the delay (ms) to wait BEFORE sending each bubble.
 * - Bubble 0: a read pause + short length-scaled composing time, clamped to
 *   FIRST_MIN..FIRST_MAX (the send loop also lifts it to the THINKING_MS floor), so
 *   the first reply lands quickly and feels responsive.
 * - Bubbles 1..N: a length-scaled "typing" gap - len * BUBBLE_GAP_PER_CHAR_MS,
 *   clamped to [BUBBLE_GAP_MIN_MS, BUBBLE_GAP_MAX_MS] - so a short message waits ~10s
 *   and a long one up to ~30s, automatically scaling with the bubble's length.
 * Deterministic (no I/O, no RNG). No total down-scaling - the budget is enforced at
 * send time by pacingFits, so real gaps are never silently shrunk.
 * Exported for unit testing.
 */
/**
 * Pure: delay (ms) before the item at `index`, scaled by its `charLen`. A flow item has
 * no text (charLen 0), so it waits the follow-on floor - a short human beat before the
 * link. Same formula the bubble trickle has always used; shared so a mixed text+flow
 * sequence paces identically. Exported logic via computeBubbleDelays for unit testing.
 */
function itemDelay(index: number, charLen: number): number {
  if (index === 0) {
    return clamp(READ_MS + charLen * PER_CHAR_MS, FIRST_MIN_MS, FIRST_MAX_MS);
  }
  return clamp(charLen * BUBBLE_GAP_PER_CHAR_MS, BUBBLE_GAP_MIN_MS, BUBBLE_GAP_MAX_MS);
}

export function computeBubbleDelays(bubbles: string[]): number[] {
  return bubbles.map((b, i) => itemDelay(i, (b ?? "").trim().length));
}

/**
 * Pure: should we actually sleep `wait` ms before the next bubble? True only if the
 * gap is positive, the request hasn't passed the deadline, AND the whole gap finishes
 * within the pacing budget - so cumulative sleep never overshoots the function's
 * maxDuration (a long random gap late in a reply is skipped rather than blowing the
 * budget; that bubble just sends immediately). Exported for unit testing.
 */
export function pacingFits(
  elapsed: number,
  wait: number,
  budget: number = BUBBLE_PACING_BUDGET_MS,
  deadline: number = PACING_DEADLINE_MS
): boolean {
  return wait > 0 && elapsed < deadline && elapsed + wait <= budget;
}

/**
 * Deliver a reply as human-like "trickle" bubbles: the first lands fast, then any
 * follow-on bubbles drip in 15–30s apart (see computeBubbleDelays). Each bubble is
 * its own sendContent call (reusing sendManychatMessage for per-call sanitize +
 * retry). A sleep happens only while it fits the pacing budget (pacingFits) so the
 * background task never exceeds the webhook's maxDuration - once the budget is spent,
 * remaining bubbles send immediately (pacing degrades, nothing is dropped).
 *
 * Because the trickle can span minutes, an optional `shouldAbort` is checked before
 * each follow-on bubble: if the lead muted / the owner took over / a newer reply
 * superseded this run, the remaining bubbles are NOT sent and { aborted: true } is
 * returned so the caller can skip the media send too.
 *
 * Every attempted bubble is always sent - a single send failure is logged and the
 * rest still send; throws once at the end if any failed so the caller can record
 * push_failed. Abort is NOT a failure (no throw).
 */
/** One step in an ordered paced delivery: a text bubble or a link-flow trigger. */
export type PacedItem =
  | { kind: "text"; text: string }
  | { kind: "flow"; flowNs: string };

/**
 * Deliver an ORDERED sequence of items - text bubbles and link-flow triggers - as one
 * continuous human-like trickle, awaiting each before the next so a flow lands exactly
 * where it sits in the sequence (a link fires at its authored position, not after all
 * text). Generalises the bubble trickle; sendManychatMessagePaced is now a thin wrapper.
 *
 * Pacing is shared with the bubble path (itemDelay/pacingFits/thinkingDelayMs): item 0
 * waits out the "thinking" pause, later items wait a length-scaled gap, and a flow (no
 * text) waits the follow-on floor - all budget-guarded via pacingFits, so a long reply
 * never overshoots maxDuration. `shouldAbort` is checked before EVERY follow-on item
 * (text or flow), so a mute/takeover/supersede stops the rest, a flow included. `pace:
 * false` sends everything in order with no gaps/thinking (pacing disabled). A single
 * item's failure is logged and the rest still send; if any failed, the call throws at
 * the end so the caller's push-failure handler runs. sendManychatFlow retries internally
 * and treats a client timeout as assume-delivered, so there is no raw-link fallback here.
 */
export async function sendManychatSequencePaced(opts: {
  subscriberId: string;
  items: PacedItem[];
  messageTag?: string;
  startedAt?: number; // performance.now() at request start, for the budget guard
  /** ManyChat API key to authenticate each send (resolved per-chatbot by the caller). */
  apiKey: string;
  /** Channel the contact is on; forwarded to each send. */
  platform?: Platform;
  /** Per-chatbot opt-in (chatbots.link_buttons_enabled): render Messenger links as URL buttons. */
  linkButtons?: boolean;
  /** Sleep between items (default true). false = deliver in order with no gaps/thinking. */
  pace?: boolean;
  /**
   * Optional stand-down check, evaluated before each FOLLOW-ON item (2..N). Return true
   * to stop sending the rest (lead muted / owner took over / superseded). If it throws,
   * this loop keeps going (fail-open) - dropping a legit reply on a transient blip is the
   * worse outcome, and the next item re-checks anyway.
   */
  shouldAbort?: () => Promise<boolean>;
}): Promise<{ aborted: boolean }> {
  // Normalise: trim text items and drop empties; keep every flow item.
  const items: PacedItem[] = [];
  for (const it of opts.items) {
    if (it.kind === "flow") items.push(it);
    else {
      const text = (it.text ?? "").trim();
      if (text) items.push({ kind: "text", text });
    }
  }
  if (items.length === 0) return { aborted: false };

  const pace = opts.pace ?? true;
  const gaps = items.map((it, i) =>
    itemDelay(i, it.kind === "text" ? it.text.length : 0)
  );
  const startedAt = opts.startedAt ?? performance.now();
  let anyFailed = false;

  for (let i = 0; i < items.length; i++) {
    if (pace) {
      // Item 0 also waits out the "thinking" pause so the first message lands ~THINKING_MS
      // after the customer's (minus time already spent generating). Later items use their
      // length-scaled gap. Sleep only while the WHOLE gap finishes within budget, else send
      // the rest immediately so cumulative pacing never overshoots maxDuration.
      const elapsed = performance.now() - startedAt;
      const wait = i === 0 ? Math.max(gaps[i], thinkingDelayMs(elapsed)) : gaps[i];
      if (pacingFits(elapsed, wait)) {
        await sleep(wait);
      }
    }

    // Mid-trickle stand-down: re-check before each follow-on item (item 0 was just
    // re-checked pre-push). Catches a stop/takeover/supersede that landed during the gap.
    // A flow is an item too, so a link never fires after an abort. Fail-open if it throws.
    if (i > 0 && opts.shouldAbort) {
      let abort = false;
      try {
        abort = await opts.shouldAbort();
      } catch (err) {
        console.error("[manychat] paced stand-down check failed; continuing", err);
      }
      if (abort) {
        console.log(
          `[manychat] paced send aborted before item ${i + 1}/${items.length} (muted/superseded)`
        );
        return { aborted: true };
      }
    }

    const item = items[i];
    try {
      if (item.kind === "text") {
        await sendManychatMessage({
          subscriberId: opts.subscriberId,
          text: item.text,
          messageTag: opts.messageTag,
          apiKey: opts.apiKey,
          platform: opts.platform,
          linkButtons: opts.linkButtons,
        });
      } else {
        await sendManychatFlow({
          subscriberId: opts.subscriberId,
          flowNs: item.flowNs,
          apiKey: opts.apiKey,
        });
      }
    } catch (err) {
      anyFailed = true;
      console.error(
        `[manychat] paced item ${i + 1}/${items.length} (${item.kind}) failed`,
        err
      );
    }
  }

  if (anyFailed) throw new Error("ManyChat paced send: one or more items failed");
  return { aborted: false };
}

export async function sendManychatMessagePaced(opts: {
  subscriberId: string;
  bubbles: string[];
  messageTag?: string;
  startedAt?: number; // performance.now() at request start, for the budget guard
  /** ManyChat API key to authenticate each send (resolved per-chatbot by the caller). */
  apiKey: string;
  /** Channel the contact is on; forwarded to each sendContent call. */
  platform?: Platform;
  /** Per-chatbot opt-in (chatbots.link_buttons_enabled): render Messenger links as URL buttons. */
  linkButtons?: boolean;
  /** Optional stand-down check, evaluated before each FOLLOW-ON bubble (2..N). */
  shouldAbort?: () => Promise<boolean>;
}): Promise<{ aborted: boolean }> {
  // Thin wrapper over the generic sequence sender: every bubble is a text item.
  return sendManychatSequencePaced({
    subscriberId: opts.subscriberId,
    items: opts.bubbles.map((text) => ({ kind: "text" as const, text })),
    messageTag: opts.messageTag,
    startedAt: opts.startedAt,
    apiKey: opts.apiKey,
    platform: opts.platform,
    linkButtons: opts.linkButtons,
    shouldAbort: opts.shouldAbort,
  });
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

/**
 * Trigger a ManyChat flow for a subscriber (ManyChat Send Flow API). Used by the
 * follow-up engine to deliver a native voice-note flow at a due step (Option B).
 *
 * THROWS on hard failure so sendFollowup's existing claim-revert-and-retry runs
 * (exactly like sendManychatMedia). A client TIMEOUT/ABORT is treated as
 * assume-delivered (returns success, no retry) - re-triggering would double-send
 * the voice note, the same rule as duplicate media (gotcha #18). A genuine
 * connection failure (request never completed) is retried. 429/5xx are retried.
 */
export async function sendManychatFlow(opts: {
  subscriberId: string;
  flowNs: string;
  apiKey: string;
}): Promise<unknown> {
  const body = JSON.stringify({ subscriber_id: opts.subscriberId, flow_ns: opts.flowNs });
  const ATTEMPTS = 3;
  const BACKOFF_MS = [1_000, 3_000];
  const TIMEOUT_MS = 15_000;
  let lastError: Error = new Error("ManyChat sendFlow: no attempts made");

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      const res = await fetch("https://api.manychat.com/fb/sending/sendFlow", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          "Content-Type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return res.json().catch(() => ({}));
      const errText = await res.text().catch(() => "");
      lastError = new Error(
        `ManyChat sendFlow failed: ${res.status} ${errText} (attempt ${attempt + 1}/${ATTEMPTS})`
      );
      if (res.status !== 429 && res.status < 500) throw lastError; // permanent
    } catch (err) {
      if (err === lastError) throw err;
      // Client timeout/abort → the request was already sent; assume the flow
      // triggered and STOP (re-triggering double-sends the voice note).
      if (classifySendError(err, {}) === "assume_delivered") return { assumedDelivered: true };
      lastError = new Error(
        `ManyChat sendFlow failed: ${err instanceof Error ? err.message : String(err)} (attempt ${attempt + 1}/${ATTEMPTS})`
      );
    }
    if (attempt < ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]));
    }
  }
  throw lastError;
}

/**
 * Parse ManyChat's getFlows response into { ns, name }[]. Pure + unit-tested.
 * Tolerates both `data.flows` and a bare `data` array; drops entries without an ns.
 */
export function parseManychatFlows(json: unknown): { ns: string; name: string }[] {
  const data = (json as { data?: unknown } | null)?.data;
  const arr: unknown[] = Array.isArray((data as { flows?: unknown })?.flows)
    ? (data as { flows: unknown[] }).flows
    : Array.isArray(data)
      ? (data as unknown[])
      : [];
  return arr
    .map((f) => {
      const o = (f ?? {}) as { ns?: unknown; name?: unknown };
      return {
        ns: typeof o.ns === "string" ? o.ns : "",
        name: typeof o.name === "string" ? o.name : "",
      };
    })
    .filter((f) => f.ns);
}

/**
 * List a page's ManyChat flows for the follow-up step picker. Throws on failure
 * (the endpoint turns that into a clean 502 the UI shows).
 */
export async function listManychatFlows(
  apiKey: string
): Promise<{ ns: string; name: string }[]> {
  const res = await fetch("https://api.manychat.com/fb/page/getFlows", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(8_000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || (json as { status?: string } | null)?.status !== "success") {
    throw new Error(
      (json as { message?: string } | null)?.message || `ManyChat getFlows returned ${res.status}`
    );
  }
  return parseManychatFlows(json);
}
