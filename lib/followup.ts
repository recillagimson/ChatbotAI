/**
 * Auto follow-up engine — step-based, hour-scale, media-rich.
 *
 * When a contact goes silent, we proactively re-engage them with an ordered
 * sequence of steps. Each step waits `delay_hours` (from the contact's last
 * message for step 1, or from the previous send afterwards), then delivers an
 * optional media/link asset + an optional text caption. The final step can loop
 * until the lead is confirmed or the messaging window closes.
 *
 * Deliverability: sends carry NO message tag, so they must land inside the
 * channel's STANDARD 24h window (PLATFORM_META.standardWindowHours). That's why
 * the drip is hour-scale (3–22h) — it fits one window. Multi-day reach past 24h
 * needs the Recurring Notifications opt-in (Phase 6). Confirmed leads and closed
 * windows stop the drip.
 *
 * The pure decision (evaluateFollowup) is unit-tested directly; sendFollowup does
 * the I/O.
 */
import type { Chatbot, Conversation, FollowupStep, FollowupAsset } from "@/lib/types";
import { sendManychatMedia } from "@/lib/manychat";
import { assetToOutbound } from "@/lib/followup-assets";
import { cleanContactField } from "@/lib/contact";
import { type Platform, PLATFORM_META, toPlatform, canPushPlatform } from "@/lib/platforms";
import type { createServiceClient } from "@/lib/supabase/server";

const HOUR_MS = 60 * 60 * 1000;

/** Instagram's out-of-window cap (days) — kept for callers/telemetry. */
export const IG_WINDOW_DAYS = PLATFORM_META.instagram.followupWindowDays ?? 7;

/** Guardrail bounds on a step delay (hours). Kept inside one 24h window. */
export const FOLLOWUP_MIN_HOURS = 1;
export const FOLLOWUP_MAX_HOURS = 22;

/**
 * Feature flag. The step engine sends inside the standard 24h window (no tag),
 * which IS deliverable — so this defaults ON. Nothing sends until a chatbot has
 * `auto_followup_enabled` + steps configured, so enabling the machinery is safe.
 * Set FOLLOWUP_ENABLED=false to hard-disable the cron.
 */
export const FOLLOWUP_ENABLED: boolean = process.env.FOLLOWUP_ENABLED !== "false";

/**
 * Phase 6 — Recurring Notifications multi-day reach. OFF by default; enable once
 * the ManyChat RN topic + opt-in are configured (see
 * docs/followup-recurring-notifications.md). When on, a contact who opted in
 * (conversations.rn_opt_in_at) can be followed up past the 24h standard window,
 * up to the channel's extended window.
 */
export const RN_ENABLED: boolean = process.env.RN_ENABLED === "true";

/** Clamp a per-step delay into the deliverable in-window range (hours). */
export function clampDelayHours(hours: number): number {
  if (!Number.isFinite(hours)) return 3;
  return Math.min(FOLLOWUP_MAX_HOURS, Math.max(FOLLOWUP_MIN_HOURS, Math.round(hours)));
}

/** Legacy: clamp the old per-chatbot day setting into 1..6 (still used by the UI). */
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
  | "auto_followup_template"
  | "auto_followup_steps"
  | "auto_followup_loop_last"
>;

export type FollowupConversation = Pick<
  Conversation,
  "status" | "last_message_at" | "last_followup_at" | "followup_count" | "followup_step_index" | "confirmed_at"
> & { platform?: Platform; rn_opt_in_at?: string | null };

/**
 * Resolve a chatbot's drip steps. Uses `auto_followup_steps` when present; else
 * falls back to a single legacy step synthesized from `auto_followup_template`
 * (so un-migrated bots keep a single follow-up). Empty → no follow-up.
 */
export function resolveSteps(chatbot: FollowupChatbot): FollowupStep[] {
  const raw = Array.isArray(chatbot.auto_followup_steps) ? chatbot.auto_followup_steps : [];
  const valid = raw
    .filter((s) => s && ((s.text ?? "").trim() || (s.asset_key ?? "").trim()))
    .map((s) => ({
      delay_hours: clampDelayHours(s.delay_hours),
      asset_key: (s.asset_key ?? "").trim() || null,
      text: s.text ?? null,
    }));
  if (valid.length) return valid;

  const tmpl = chatbot.auto_followup_template?.trim();
  if (tmpl) {
    return [{ delay_hours: clampDelayHours((chatbot.auto_followup_days ?? 1) * 24), asset_key: null, text: tmpl }];
  }
  return [];
}

export interface FollowupDecision {
  due: boolean;
  reason:
    | "due"
    | "disabled"
    | "no_steps"
    | "not_active"
    | "confirmed"
    | "channel_unsupported"
    | "window_closed"
    | "sequence_done"
    | "not_due_yet";
  /** The step to send (present when due). */
  step?: FollowupStep;
  /** Value to write to conversations.followup_step_index after a successful send. */
  nextStepIndex?: number;
  /**
   * True when the send falls PAST the channel's standard (24h, no-tag) window —
   * only possible on the RN path. Such sends need a message tag / RN delivery.
   */
  outOfWindow?: boolean;
}

/**
 * Decide whether a single conversation is due for a follow-up right now, and if
 * so, which step to send. Pure (no I/O) so it can be unit-tested directly.
 */
export function evaluateFollowup(
  chatbot: FollowupChatbot,
  conversation: FollowupConversation,
  now: Date,
  opts?: { rnEnabled?: boolean }
): FollowupDecision {
  if (!chatbot.auto_followup_enabled) return { due: false, reason: "disabled" };

  const steps = resolveSteps(chatbot);
  if (steps.length === 0) return { due: false, reason: "no_steps" };

  if (conversation.status !== "active") return { due: false, reason: "not_active" };
  if (conversation.confirmed_at) return { due: false, reason: "confirmed" };

  // Channels with no ManyChat send API (TikTok) can't receive follow-ups.
  const platform = toPlatform(conversation.platform);
  if (!canPushPlatform(platform)) return { due: false, reason: "channel_unsupported" };

  const nowMs = now.getTime();
  const lastMsgMs = new Date(conversation.last_message_at).getTime();

  // Standard 24h in-window cap (no-tag sends). null = no window (Telegram).
  // With Recurring Notifications enabled AND the contact opted in, extend to the
  // channel's longer window (Phase 6) so we can keep chasing past 24h.
  const meta = PLATFORM_META[platform];
  const rnActive = !!(opts?.rnEnabled && conversation.rn_opt_in_at);
  const winHours = rnActive
    ? meta.followupWindowDays != null
      ? meta.followupWindowDays * 24
      : null
    : meta.standardWindowHours;
  if (winHours != null && nowMs - lastMsgMs >= winHours * HOUR_MS)
    return { due: false, reason: "window_closed" };

  // Past the standard no-tag window (only reachable on the RN path)? Such a send
  // must carry a message tag / RN delivery, flagged to the caller below.
  const outOfWindow =
    meta.standardWindowHours != null &&
    nowMs - lastMsgMs >= meta.standardWindowHours * HOUR_MS;

  // Which step are we on? Past the end, loop the last step or stop.
  const idx = conversation.followup_step_index ?? 0;
  let sendIdx = idx;
  if (idx >= steps.length) {
    if (!chatbot.auto_followup_loop_last) return { due: false, reason: "sequence_done" };
    sendIdx = steps.length - 1;
  }
  const step = steps[sendIdx];

  // Delay is measured from the previous send, or the contact's last message for
  // the very first step.
  const refMs = conversation.last_followup_at
    ? new Date(conversation.last_followup_at).getTime()
    : lastMsgMs;
  if (nowMs - refMs < step.delay_hours * HOUR_MS) return { due: false, reason: "not_due_yet" };

  return { due: true, reason: "due", step, nextStepIndex: idx + 1, outOfWindow };
}

/**
 * Send one drip step (media asset + text caption) and advance state.
 *
 * Concurrency-safe via CLAIM-BEFORE-SEND: the follow-up state is advanced with a
 * conditional UPDATE guarded on the exact state this run evaluated
 * (followup_step_index + last_followup_at). If another concurrent run already
 * claimed the row (overlapping cron, manual trigger), the guard matches 0 rows
 * and we return null WITHOUT sending — no double-send. If the send then fails,
 * the claim is best-effort reverted so the next run retries while still
 * in-window (preserving the original retry-on-failure property).
 *
 * Channel-aware: an asset the channel can't push (e.g. a voice note on
 * Instagram) is dropped by sendManychatMedia; the text caption still delivers.
 * Does NOT touch `last_message_at` (that tracks the contact's real last inbound
 * and gates the window).
 *
 * Returns the recorded message content, or null when the claim was lost.
 */
export async function sendFollowup(
  supabase: ReturnType<typeof createServiceClient>,
  conversation: Pick<
    Conversation,
    | "id"
    | "manychat_subscriber_id"
    | "contact_name"
    | "followup_count"
    | "followup_step_index"
    | "last_followup_at"
  > & { platform?: Platform },
  step: FollowupStep,
  asset: FollowupAsset | null,
  now: Date,
  apiKey: string,
  nextStepIndex: number,
  opts?: { messageTag?: string }
): Promise<string | null> {
  const prevIndex = conversation.followup_step_index ?? 0;
  const prevFollowupAt = conversation.last_followup_at ?? null;
  const claimedAt = now.toISOString();

  // 1. Claim: advance state only if it still matches what we evaluated.
  let claimQuery = supabase
    .from("conversations")
    .update({
      last_followup_at: claimedAt,
      followup_count: (conversation.followup_count ?? 0) + 1,
      followup_step_index: nextStepIndex,
    })
    .eq("id", conversation.id)
    .eq("followup_step_index", prevIndex);
  claimQuery =
    prevFollowupAt === null
      ? claimQuery.is("last_followup_at", null)
      : claimQuery.eq("last_followup_at", prevFollowupAt);
  const { data: claimed, error: claimError } = await claimQuery.select("id");
  if (claimError) throw new Error(`followup claim failed: ${claimError.message}`);
  if (!claimed?.length) return null; // another run claimed this conversation

  // 2. Send. Clean the stored name so a never-resolved "{{first_name}}" doesn't
  // get sent; renderTemplate falls back to "there" when name is null.
  const text = renderTemplate(step.text ?? "", {
    name: cleanContactField(conversation.contact_name),
  });
  const platform = toPlatform(conversation.platform);
  const outbound = assetToOutbound(asset);

  try {
    await sendManychatMedia({
      subscriberId: conversation.manychat_subscriber_id,
      assets: outbound ? [outbound] : [],
      text,
      apiKey,
      platform,
      messageTag: opts?.messageTag,
    });
  } catch (err) {
    // 2a. Send failed: best-effort revert of OUR claim (guarded on the values we
    // wrote) so the next cron run retries this step. If the revert itself fails,
    // the step is skipped rather than double-sent — the safer failure mode.
    await supabase
      .from("conversations")
      .update({
        last_followup_at: prevFollowupAt,
        followup_count: conversation.followup_count ?? 0,
        followup_step_index: prevIndex,
      })
      .eq("id", conversation.id)
      .eq("followup_step_index", nextStepIndex)
      .eq("last_followup_at", claimedAt)
      .then(
        () => {},
        () => {}
      );
    throw err;
  }

  // 3. Record the outbound message. content is NOT NULL — use the caption, or a
  // note for media-only steps. media_type stays a real MIME (or null): the inbox
  // renderer matches on startsWith("image/"|"audio/"|"video/").
  const content = text || (asset ? `(sent ${asset.kind})` : "(follow-up)");
  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    role: "assistant",
    content,
    ai_generated: false,
    tokens_used: 0,
    media_url: asset?.url ?? null,
    media_type: asset?.mime ?? null,
  });

  return content;
}
