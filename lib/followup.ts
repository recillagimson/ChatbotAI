/**
 * Auto follow-up logic — shared by the cron route and tests.
 *
 * When a contact goes silent, we proactively re-engage them with the chatbot's
 * custom template. This always fires OUTSIDE Instagram's 24h messaging window,
 * so the send uses the HUMAN_AGENT tag (see lib/manychat.ts). Instagram blocks
 * any message sent more than ~7 days after the user's last message, which is a
 * hard cap enforced in `evaluateFollowup` regardless of repeat settings.
 */
import type { Chatbot, Conversation } from "@/lib/types";
import { sendManychatMessage } from "@/lib/manychat";
import type { createServiceClient } from "@/lib/supabase/server";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Instagram won't deliver messages sent more than this many days after the
 * user's last inbound message (even with the HUMAN_AGENT tag). */
export const IG_WINDOW_DAYS = 7;

/**
 * Feature flag — auto follow-up is PARKED (delivery not yet possible).
 *
 * Live testing (2026-06) showed ManyChat/Instagram blocks ANY send more than
 * 24h after the contact's last message: the HUMAN_AGENT tag is rejected
 * ("Unsupported message tag") and a plain send returns code 3031
 * ("...without a Notification Reason. Subscriber's last interaction was more
 * than 24 hours ago"). Day-scale follow-ups therefore require an Instagram
 * Recurring Notifications opt-in, which isn't built yet.
 *
 * All the machinery below (settings, cron, due-logic, reset-on-reply) is ready
 * and unit-tested. Flip this to `true` once the opt-in delivery path exists.
 */
export const FOLLOWUP_ENABLED: boolean = false;

/** Clamp the per-chatbot day setting into the deliverable 1..6 range. */
export function clampFollowupDays(days: number): number {
  if (!Number.isFinite(days)) return 3;
  return Math.min(6, Math.max(1, Math.round(days)));
}

/** Replace {{name}} (any casing/spacing) with the contact's name, or "there". */
export function renderTemplate(
  template: string,
  vars: { name?: string | null }
): string {
  const name = (vars.name ?? "").trim() || "there";
  return template.replace(/\{\{\s*name\s*\}\}/gi, name);
}

export type FollowupChatbot = Pick<
  Chatbot,
  | "auto_followup_enabled"
  | "auto_followup_days"
  | "auto_followup_repeat"
  | "auto_followup_max"
  | "auto_followup_template"
>;

export type FollowupConversation = Pick<
  Conversation,
  "status" | "last_message_at" | "last_followup_at" | "followup_count"
>;

export interface FollowupDecision {
  due: boolean;
  reason:
    | "due"
    | "disabled"
    | "no_template"
    | "not_active"
    | "ig_window_closed"
    | "max_reached"
    | "not_due_yet";
}

/**
 * Decide whether a single conversation is due for a follow-up right now.
 * Pure function — no I/O — so it can be unit-tested directly.
 */
export function evaluateFollowup(
  chatbot: FollowupChatbot,
  conversation: FollowupConversation,
  now: Date
): FollowupDecision {
  if (!chatbot.auto_followup_enabled) return { due: false, reason: "disabled" };
  if (!chatbot.auto_followup_template?.trim())
    return { due: false, reason: "no_template" };
  if (conversation.status !== "active")
    return { due: false, reason: "not_active" };

  const nowMs = now.getTime();
  const lastMsgMs = new Date(conversation.last_message_at).getTime();

  // Hard Instagram cap: can't message past the 7-day window. This also bounds
  // how many repeats can ever fire, since the window never reopens until the
  // user replies (which resets last_message_at via the webhook).
  if (nowMs - lastMsgMs >= IG_WINDOW_DAYS * DAY_MS)
    return { due: false, reason: "ig_window_closed" };

  const maxSends = chatbot.auto_followup_repeat
    ? Math.max(1, chatbot.auto_followup_max)
    : 1;
  if ((conversation.followup_count ?? 0) >= maxSends)
    return { due: false, reason: "max_reached" };

  // Days are measured from the last follow-up (for repeats) or the user's last
  // message (for the first follow-up).
  const days = clampFollowupDays(chatbot.auto_followup_days);
  const refMs = conversation.last_followup_at
    ? new Date(conversation.last_followup_at).getTime()
    : lastMsgMs;
  if (nowMs - refMs < days * DAY_MS) return { due: false, reason: "not_due_yet" };

  return { due: true, reason: "due" };
}

/**
 * Send one follow-up and advance state. Sends FIRST (so a delivery failure
 * leaves state untouched and the cron retries next run while still in-window),
 * then records the outbound message + bumps follow-up state. Does NOT touch
 * `last_message_at` — that tracks the user's real last inbound and gates the
 * 7-day window.
 */
export async function sendFollowup(
  supabase: ReturnType<typeof createServiceClient>,
  conversation: Pick<
    Conversation,
    "id" | "manychat_subscriber_id" | "contact_name" | "followup_count"
  >,
  template: string,
  now: Date,
  apiKey: string
): Promise<string> {
  const text = renderTemplate(template, { name: conversation.contact_name });

  await sendManychatMessage({
    subscriberId: conversation.manychat_subscriber_id,
    text,
    messageTag: "HUMAN_AGENT",
    apiKey,
  });

  await Promise.all([
    supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "assistant",
      content: text,
      ai_generated: false,
      tokens_used: 0,
    }),
    supabase
      .from("conversations")
      .update({
        last_followup_at: now.toISOString(),
        followup_count: (conversation.followup_count ?? 0) + 1,
      })
      .eq("id", conversation.id),
  ]);

  return text;
}
