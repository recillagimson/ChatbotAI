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
 * Optional: actively send a message back via ManyChat Send Content API
 * (used when AI reply must be sent OUT of the webhook cycle, e.g. follow-ups).
 *
 * Most flows don't need this — the External Request response IS the reply.
 */
export async function sendManychatMessage(opts: {
  subscriberId: string;
  text: string;
}) {
  const apiKey = process.env.MANYCHAT_API_KEY;
  if (!apiKey) throw new Error("MANYCHAT_API_KEY not set");

  const res = await fetch("https://api.manychat.com/fb/sending/sendContent", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      subscriber_id: opts.subscriberId,
      data: {
        version: "v2",
        content: { messages: [{ type: "text", text: opts.text }] },
      },
      message_tag: "ACCOUNT_UPDATE",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ManyChat send failed: ${res.status} ${err}`);
  }
  return res.json();
}
