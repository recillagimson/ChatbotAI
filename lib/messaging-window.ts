/**
 * Instagram/Messenger messaging-window helpers — pure, dependency-light so both
 * the manual reply route and the push-reconciliation cron can share one source of
 * truth. Instagram/Messenger only allow a free-form (no-tag) send within 24h of the
 * contact's last message; the HUMAN_AGENT tag extends that to the channel's
 * `followupWindowDays` (7) for genuine human-agent replies.
 */
import { PLATFORM_META, type Platform } from "./platforms";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Channels where the HUMAN_AGENT message tag applies (extends the send window). */
export function supportsHumanAgentTag(platform: Platform): boolean {
  return platform === "instagram" || platform === "messenger";
}

/**
 * Can a saved-but-undelivered message still be delivered on a retry NOW? A no-tag
 * `assistant` reply is bounded by the standard window (24h); a `human_agent` reply
 * on a tag-supporting channel can go out to `followupWindowDays` (7) with the
 * HUMAN_AGENT tag. `lastInboundMs` = the contact's last inbound message time.
 * Unknown last-inbound → not deliverable (no open window). Pure + unit-tested.
 */
export function retryStillDeliverable(
  platform: Platform,
  role: string,
  lastInboundMs: number | null,
  nowMs: number
): boolean {
  const meta = PLATFORM_META[platform];
  // No window concept on the channel (Telegram) → always deliverable if pushable.
  if (meta.standardWindowHours == null) return !!meta.canPush;
  if (lastInboundMs == null) return false;
  const elapsed = nowMs - lastInboundMs;
  const canTag = role === "human_agent" && supportsHumanAgentTag(platform);
  const windowMs = canTag
    ? (meta.followupWindowDays ?? 0) * DAY_MS
    : meta.standardWindowHours * HOUR_MS;
  return windowMs > 0 && elapsed < windowMs;
}

/**
 * The message tag to use for a retry send, or undefined for a standard no-tag send.
 * Only a `human_agent` reply on a tag-supporting channel carries HUMAN_AGENT.
 */
export function retryMessageTag(platform: Platform, role: string): string | undefined {
  return role === "human_agent" && supportsHumanAgentTag(platform) ? "HUMAN_AGENT" : undefined;
}
