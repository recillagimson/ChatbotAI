/**
 * Instagram/Messenger messaging-window helpers - pure, dependency-light so the manual
 * reply route, the push-reconciliation cron and the Follow-ups queue share one source
 * of truth.
 *
 * Every send we make goes through ManyChat's public Send Content API, and it is always
 * UNTAGGED. Instagram/Messenger only accept an untagged send within 24h of the
 * contact's last message. The HUMAN_AGENT tag (7 days) is NOT available to us:
 * ManyChat's API refuses `message_tag: "HUMAN_AGENT"` ("Unsupported message tag") and
 * applies that tag itself, only to messages a person types in ManyChat's own Inbox.
 * Sending it is what broke every manual reply from 2026-07-27 to 2026-09-28. So past
 * 24h the only way to reach an IG/Messenger lead is ManyChat's Inbox, for up to the
 * channel's `followupWindowDays` (7).
 */
import { PLATFORM_META, type Platform } from "./platforms";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Channels where a person replying in ManyChat's Inbox gets the HUMAN_AGENT tag
 * (applied by ManyChat, never by us), reaching a lead for `followupWindowDays` (7)
 * instead of 24h. Our own API sends never carry it.
 */
export function supportsHumanAgentTag(platform: Platform): boolean {
  return platform === "instagram" || platform === "messenger";
}

/**
 * Can a saved-but-undelivered message still be delivered on a retry NOW? A retry is an
 * untagged API send like any other, so it is bounded by the channel's standard window
 * (24h) whoever wrote it. `lastInboundMs` = the contact's last inbound message time.
 * Unknown last-inbound → not deliverable (no open window). Pure + unit-tested.
 */
export function retryStillDeliverable(
  platform: Platform,
  lastInboundMs: number | null,
  nowMs: number
): boolean {
  const meta = PLATFORM_META[platform];
  // No window concept on the channel (Telegram) → always deliverable if pushable.
  if (meta.standardWindowHours == null) return !!meta.canPush;
  if (lastInboundMs == null) return false;
  return nowMs - lastInboundMs < meta.standardWindowHours * HOUR_MS;
}

/**
 * Has the channel's standard window closed since the lead's last message? Used only to
 * EXPLAIN a refused manual send, never to block one: our clock (messages.created_at) is
 * not Meta's, and a lead can reopen the window in ways we never see (a story reply
 * handled by a ManyChat automation), so the send is always attempted. Unknown
 * last-inbound or a channel with no window → false (we can't claim it closed). Pure.
 */
export function manualReplyWindowClosed(
  platform: Platform,
  lastInboundMs: number | null,
  nowMs: number
): boolean {
  const hours = PLATFORM_META[platform].standardWindowHours;
  if (hours == null || lastInboundMs == null || !Number.isFinite(lastInboundMs)) return false;
  return nowMs - lastInboundMs >= hours * HOUR_MS;
}

/** ManyChat/Meta wording for a send refused because of the messaging window or a tag. */
const WINDOW_REFUSAL = /message tag|interaction|window|24 ?h/i;

/**
 * The error a failed manual send shows the owner in the composer. ManyChat's own reason
 * (already cleaned by manychatFailureReason) is never hidden: past the standard window,
 * a window/tag refusal (or no reason) gets the plain "it's been more than 24 hours"
 * explanation, but an UNRELATED refusal (a revoked key, a bad subscriber) leads with
 * ManyChat's words and adds the window only as context. Where ManyChat's Inbox can
 * still reach the lead, it says to reply there. No em/en dashes (visible UI copy). Pure.
 */
export function manualReplyFailureMessage(opts: {
  platform: Platform;
  reason: string | null;
  windowClosed: boolean;
}): string {
  const meta = PLATFORM_META[opts.platform];
  const label = meta.label;
  const said = opts.reason
    ? `ManyChat said: ${/[.!?]$/.test(opts.reason) ? opts.reason : `${opts.reason}.`}`
    : null;
  if (opts.windowClosed && meta.standardWindowHours != null) {
    const hours = meta.standardWindowHours;
    const inbox = supportsHumanAgentTag(opts.platform) && meta.followupWindowDays;
    if (!said || WINDOW_REFUSAL.test(opts.reason!)) {
      const closed = `${label} didn't accept this message because it's been more than ${hours} hours since this lead last messaged you.`;
      return inbox
        ? `${closed} You can still reply from ManyChat's Inbox for up to ${meta.followupWindowDays} days after their last message.`
        : `${closed} You can reply here again once they send you a new message.`;
    }
    const also = `It's also been more than ${hours} hours since this lead last messaged you, so`;
    return inbox
      ? `Couldn't deliver the message to ${label}. ${said} ${also} reply from ManyChat's Inbox (up to ${meta.followupWindowDays} days after their last message).`
      : `Couldn't deliver the message to ${label}. ${said} ${also} you can reply here again once they send you a new message.`;
  }
  if (said) return `Couldn't deliver the message to ${label}. ${said}`;
  return `Couldn't deliver the message to ${label}. Please try again.`;
}
