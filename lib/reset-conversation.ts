import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The column defaults a reset restores — i.e. fresh-conversation state. Identity
 * fields (user_id, chatbot_id, contact_*, manychat_subscriber_id, platform) are
 * deliberately NOT listed, so a reset keeps WHO the contact is and only wipes their
 * funnel progress. Single source of truth shared by the webhook RESET_KEYWORD path
 * and the admin "Reset conversation" button so the two can never drift.
 *
 * `bot_off_at` IS cleared: like `user_muted_at` and `status`, it is a funnel-silencing
 * flag (the webhook's bot-off gate fully silences a thread whenever it's set), not an
 * identity field — a "brand-new" contact is never bot-off, and leaving it set would let
 * a previously BOT_OFF-tagged thread silently swallow the very welcome/keyword/AI replies
 * the reset exists to re-test. (It mirrors a ManyChat tag, so it may re-sync to "off" on
 * the next tag-change webhook — an accepted, self-healing tradeoff.)
 */
export const FRESH_CONVERSATION_RESET: Record<string, unknown> = {
  confirmed_at: null,
  confirmed_by: null,
  tag: "lead",
  welcomed_at: null,
  user_muted_at: null,
  bot_off_at: null,
  status: "active",
  keyword_fired: [],
  followup_step_index: 0,
  followup_count: 0,
  last_followup_at: null,
  start_on: null,
  start_note: null,
  memory_summary: null,
  memory_summary_at: null,
  extraction_attempts: 0,
  flagged_at: null,
  reply_claimed_for: null,
  rn_opt_in_at: null,
  rn_topic_id: null,
  unread_count: 0,
};

/**
 * Wipe a conversation back to true first-contact state: restore
 * {@link FRESH_CONVERSATION_RESET} and delete its transcript. Returns `{ ok:false, error }`
 * on any DB failure — supabase-js resolves errors instead of throwing, so a silent RLS
 * deny or transient error would otherwise read as a false success on the exact stuck
 * thread a reset exists to recover. Callers surface the failure honestly.
 *
 * Ordering matters for partial-failure safety: the **reversible** row update runs FIRST,
 * and the **irreversible** transcript delete runs only if it succeeded. So a failure
 * never leaves the transcript deleted while the funnel flags stay stale — the caller
 * simply retries, and the worst case (row reset, delete still pending) self-heals on the
 * next attempt. The error message names which step failed.
 *
 * Authorization is the CALLER's responsibility (the webhook's RESET_KEYWORD match, or the
 * requireSuperadmin gate on the reset route) — this helper does not gate.
 */
export async function resetConversation(
  supabase: SupabaseClient,
  conversationId: string
): Promise<{ ok: boolean; error?: string }> {
  // 1. Restore fresh-conversation defaults (identity fields kept). Reversible, so it
  //    goes first: if it fails we bail with the transcript still intact.
  const { error: rowErr } = await supabase
    .from("conversations")
    .update(FRESH_CONVERSATION_RESET)
    .eq("id", conversationId);
  if (rowErr) return { ok: false, error: `row reset failed: ${rowErr.message}` };

  // 2. Wipe the transcript so the next inbound is a true first contact. Irreversible,
  //    so it runs only after the row reset succeeded.
  const { error: wipeErr } = await supabase
    .from("messages")
    .delete()
    .eq("conversation_id", conversationId);
  if (wipeErr) return { ok: false, error: `transcript wipe failed: ${wipeErr.message}` };

  return { ok: true };
}
