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

/** Constant-time compare of the shared webhook secret. */
export function verifyManychatSecret(provided: string | null): boolean {
  const expected = process.env.MANYCHAT_WEBHOOK_SECRET;
  if (!expected || !provided) return false;
  const a = createHash("sha256").update(expected).digest();
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
export async function sendManychatMessage(opts: {
  subscriberId: string;
  /**
   * Reply text. Pass a string for a single bubble, or an array to send several
   * separate DM bubbles in one call (each element renders as its own message).
   */
  text: string | string[];
  /** Instagram message tag for sending outside the 24h window (e.g. "HUMAN_AGENT"). */
  messageTag?: string;
}) {
  const apiKey = process.env.MANYCHAT_API_KEY;
  if (!apiKey) throw new Error("MANYCHAT_API_KEY not set");

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
        type: "instagram",
        messages: texts.map((t) => ({ type: "text", text: t })),
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
