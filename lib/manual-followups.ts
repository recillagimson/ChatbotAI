/**
 * Manual follow-up queue - the threads the bot can no longer reach on its own,
 * but you still can.
 *
 * Instagram and Messenger only accept an untagged send within 24 hours of the
 * contact's last message (PLATFORM_META.standardWindowHours). Past that, every
 * automated send bounces, which is where a chatbot's "failed sends" number comes
 * from. Those threads aren't lost - they just need a human to send the next
 * message by hand, which is what the Follow-ups screen is for.
 *
 * The queue is bounded at BOTH ends. It opens at 24 hours (before that the bot
 * has it) and it shuts when even a hand-sent reply stops being deliverable -
 * seven days on Instagram/Messenger, where the HUMAN_AGENT tag runs out. Past
 * that edge a card would be a button that silently fails, so the thread leaves
 * the queue rather than sitting there looking actionable.
 *
 * The clock is the LEAD's last message, never yours. `last_message_at` is not
 * that clock: the manual-reply route stamps it too (app/api/conversations/[id]/
 * reply/route.ts), so a thread you nudged would look freshly reopened and its
 * seven-day edge would drift a day further out every time you sent. Callers
 * that care - the queue and the sidebar badge - resolve the lead's real last
 * inbound via [lib/lead-activity.ts] and pass it as `last_inbound_at`.
 *
 * Pure functions only - the bucket maths is unit-testable and shared by the
 * Follow-ups page, the sidebar badge and the Statistics panel so all three
 * always agree on the count.
 */
import { PLATFORMS, PLATFORM_META, toPlatform, type Platform } from "@/lib/platforms";
import { supportsHumanAgentTag } from "@/lib/messaging-window";
import { followupBlocked } from "@/lib/followup";

const HOUR_MS = 60 * 60 * 1000;

/** How close to the window edge counts as "closing soon" (the amber band). */
export const CLOSING_SOON_HOURS = 6;

export type WindowBucket =
  /** Inside the window with room to spare - the bot is handling it. */
  | "open"
  /** Inside the window but within CLOSING_SOON_HOURS of the cutoff. */
  | "closing"
  /** Past the window but still reachable by hand - the queue. */
  | "manual"
  /** Past even the hand-send window: nothing this app sends will arrive. */
  | "expired"
  /** The channel has no window (Telegram) or can't be pushed to (TikTok). */
  | "n/a";

/** The minimum a conversation row must carry to be bucketed. */
export interface WindowConversation {
  platform?: string | null;
  /** Latest activity of any kind - includes replies you sent. */
  last_message_at: string;
  /**
   * The LEAD's last inbound message. Resolved by [lib/lead-activity.ts]; when
   * absent the maths falls back to `last_message_at`, which is the same value
   * on every thread you haven't hand-replied to.
   */
  last_inbound_at?: string | null;
  status?: string | null;
  confirmed_at?: string | null;
  user_muted_at?: string | null;
  bot_off_at?: string | null;
  tag?: string | null;
}

/** The timestamp every window in here is measured from: the lead's last message. */
export function leadLastMessageAt(c: WindowConversation): string {
  return c.last_inbound_at ?? c.last_message_at;
}

/**
 * How long a reply YOU send stays deliverable, counted from the lead's last
 * message. Seven days on Instagram/Messenger (the HUMAN_AGENT tag); on channels
 * with no such tag it's just the standard window, because a hand-sent reply gets
 * no more reach than an automated one. Null where the channel has no window.
 *
 * Deliberately mirrors `retryStillDeliverable` - that function decides whether a
 * send actually goes out, and a queue that disagreed with it would be offering
 * work the app can't do.
 */
export function reachHours(platform: Platform): number | null {
  const meta = PLATFORM_META[platform];
  if (meta.standardWindowHours == null) return null;
  return supportsHumanAgentTag(platform) && meta.followupWindowDays
    ? meta.followupWindowDays * 24
    : meta.standardWindowHours;
}

/**
 * The longest any channel stays reachable (168h - Instagram/Messenger). Nothing
 * older than this can enter the queue on any channel, so it's the lookback
 * callers use when resolving inbound history.
 */
export const MAX_REACH_HOURS = Math.max(
  ...PLATFORMS.map((p) => reachHours(p) ?? 0)
);

/** ISO timestamp of the oldest lead message that could still be actionable. */
export function queueLookbackIso(nowMs: number = Date.now()): string {
  return new Date(nowMs - MAX_REACH_HOURS * HOUR_MS).toISOString();
}

/**
 * Which side of the messaging window is this thread on right now?
 *
 * Returns "n/a" for channels with no window concept rather than pretending they
 * are always open - the caller filters those out of the queue entirely, since
 * "the bot can't reach this" is meaningless where there is no cutoff.
 */
export function windowBucket(
  c: WindowConversation,
  nowMs: number = Date.now()
): WindowBucket {
  const platform = toPlatform(c.platform);
  const windowHours = PLATFORM_META[platform].standardWindowHours;
  if (windowHours == null) return "n/a";

  const last = new Date(leadLastMessageAt(c)).getTime();
  if (!Number.isFinite(last)) return "n/a";

  const elapsedHours = (nowMs - last) / HOUR_MS;
  const reach = reachHours(platform);
  if (reach != null && elapsedHours >= reach) return "expired";
  if (elapsedHours >= windowHours) return "manual";
  if (elapsedHours >= windowHours - CLOSING_SOON_HOURS) return "closing";
  return "open";
}

/**
 * Does this thread belong in the manual queue?
 *
 * Two gates, both necessary: the window has closed (the bot physically can't
 * send), AND the lead is still worth chasing. `followupBlocked` is the app's
 * existing "stop chasing" verdict - a won, muted, disqualified, spam or
 * bot-off thread never appears here, so the queue only ever shows work that is
 * actually worth a human's minute.
 */
export function needsManualFollowup(
  c: WindowConversation,
  nowMs: number = Date.now()
): boolean {
  return windowBucket(c, nowMs) === "manual" && !followupBlocked(c);
}

export interface WindowCounts {
  /** Live threads the bot can still reach automatically. */
  open: number;
  /** Live threads inside the last few hours of their window. */
  closing: number;
  /** Live threads past the window but still reachable by hand - the queue. */
  manual: number;
  /** Live threads past even the hand-send window. Nothing sends from here. */
  expired: number;
}

/** Bucket a set of conversations in one pass. Blocked threads are excluded. */
export function countWindows(
  rows: WindowConversation[],
  nowMs: number = Date.now()
): WindowCounts {
  const counts: WindowCounts = { open: 0, closing: 0, manual: 0, expired: 0 };
  for (const r of rows) {
    if (followupBlocked(r)) continue;
    const bucket = windowBucket(r, nowMs);
    if (bucket === "open") counts.open += 1;
    else if (bucket === "closing") counts.closing += 1;
    else if (bucket === "manual") counts.manual += 1;
    else if (bucket === "expired") counts.expired += 1;
  }
  return counts;
}

/**
 * "6d 2h", "1d 6h", "3h", "just now" - how long the lead has been waiting.
 * Days-and-hours rather than a date, because the number that matters to the
 * person working the queue is how cold the thread has gone.
 */
export function waitingFor(iso: string, nowMs: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "-";
  const mins = Math.max(0, Math.floor((nowMs - then) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  return rem ? `${days}d ${rem}h` : `${days}d`;
}

/** Hours remaining before this thread's send window shuts. Null when n/a. */
export function hoursLeftInWindow(
  c: WindowConversation,
  nowMs: number = Date.now()
): number | null {
  const platform = toPlatform(c.platform);
  const windowHours = PLATFORM_META[platform].standardWindowHours;
  if (windowHours == null) return null;
  const last = new Date(leadLastMessageAt(c)).getTime();
  if (!Number.isFinite(last)) return null;
  return Math.max(0, windowHours - (nowMs - last) / HOUR_MS);
}

/** Where to open this thread in the native app, for a copy-and-paste send. */
export function nativeInboxUrl(platform: Platform): string | null {
  switch (platform) {
    case "instagram":
      return "https://www.instagram.com/direct/inbox/";
    case "messenger":
      return "https://www.facebook.com/messages/t/";
    case "whatsapp":
      return "https://web.whatsapp.com/";
    case "telegram":
      return "https://web.telegram.org/";
    default:
      return null;
  }
}

/** "Open in Instagram" / "Open in Messenger" - the design's button label. */
export function nativeInboxLabel(platform: Platform): string {
  return platform === "messenger"
    ? "Open in Messenger"
    : `Open in ${PLATFORM_META[platform].label}`;
}

/**
 * ManyChat Live Chat account root - the fallback "Open in ManyChat" target when we
 * cannot build a per-conversation deep link (see `manychatConversationUrl`). Opens the
 * app's inbox but not the specific thread, so it is only used when neither a stored
 * `live_chat_url` nor a `page_id` is known for the conversation.
 */
export const MANYCHAT_LIVE_CHAT_URL = "https://app.manychat.com/";

/**
 * A ManyChat Live Chat deep link, or null. Accepts ONLY an absolute https URL on a
 * manychat.com host, so an un-rendered merge field ("{{live_chat_url}}"), a blank, a
 * placeholder, or any off-domain value is rejected rather than stored or turned into a
 * clickable button. Shared by the inbound webhook (what to persist) and the URL builder
 * (what to trust) so both agree on what counts as a real link. Pure.
 */
export function cleanLiveChatUrl(value: string | null | undefined): string | null {
  const t = value?.trim();
  return t && /^https:\/\/([a-z0-9-]+\.)*manychat\.com\//i.test(t) ? t : null;
}

/**
 * The "Open in ManyChat" target for one conversation, best source first:
 *
 *  1. ManyChat's own per-subscriber `live_chat_url`, captured verbatim from the webhook.
 *     Channel-safe (Instagram/Messenger/WhatsApp/Telegram) with no URL-format assumption -
 *     the preferred source when the owner maps the "Live Chat URL" system field.
 *  2. The Live Chat deep link built from the ManyChat page id + subscriber id:
 *     `https://app.manychat.com/fb{pageId}/chat/{subscriberId}`. The trailing id is the
 *     `manychat_subscriber_id` we already store; `{pageId}` is the inbound webhook's
 *     `page_id`. Verbatim-confirmed for Facebook Messenger and Instagram-via-Facebook
 *     (LGF's channels); ids are URL-encoded defensively though ManyChat sends them numeric.
 *  3. The account root (`MANYCHAT_LIVE_CHAT_URL`) - opens ManyChat but not the thread.
 *     Guarantees the button is never a dead link before the owner maps either field.
 *
 * Pure; safe to call per row while rendering the queue.
 */
export function manychatConversationUrl(opts: {
  liveChatUrl?: string | null;
  pageId?: string | null;
  subscriberId?: string | null;
}): string {
  const live = cleanLiveChatUrl(opts.liveChatUrl);
  if (live) return live;
  const pageId = opts.pageId?.trim();
  const subscriberId = opts.subscriberId?.trim();
  if (pageId && subscriberId) {
    return `https://app.manychat.com/fb${encodeURIComponent(pageId)}/chat/${encodeURIComponent(subscriberId)}`;
  }
  return MANYCHAT_LIVE_CHAT_URL;
}
