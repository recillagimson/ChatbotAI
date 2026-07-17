import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The column defaults a reset restores — i.e. fresh-conversation state. Identity
 * fields (user_id, chatbot_id, contact_*, manychat_subscriber_id, platform) are
 * deliberately NOT listed, so a reset keeps WHO the contact is and only wipes their
 * funnel progress. Single source of truth shared by the webhook RESET_KEYWORD path
 * and the admin "Reset conversation" button so the two can never drift.
 */
export const FRESH_CONVERSATION_RESET: Record<string, unknown> = {
  confirmed_at: null,
  confirmed_by: null,
  tag: "lead",
  welcomed_at: null,
  user_muted_at: null,
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
 * Wipe a conversation back to true first-contact state: delete its transcript and
 * restore {@link FRESH_CONVERSATION_RESET}. Returns `{ ok:false, error }` on any DB
 * failure — supabase-js resolves errors instead of throwing, so a silent RLS deny or
 * transient error would otherwise read as a false success on the exact stuck thread a
 * reset exists to recover. Callers surface the failure honestly.
 *
 * Authorization is the CALLER's responsibility (the webhook's RESET_KEYWORD match, or
 * the requireSuperadmin gate on the reset route) — this helper does not gate.
 */
export async function resetConversation(
  supabase: SupabaseClient,
  conversationId: string
): Promise<{ ok: boolean; error?: string }> {
  // Wipe the transcript so the next inbound is a true first contact.
  const { error: wipeErr } = await supabase
    .from("messages")
    .delete()
    .eq("conversation_id", conversationId);
  // Reset the row to fresh-conversation defaults (identity fields kept).
  const { error: rowErr } = await supabase
    .from("conversations")
    .update(FRESH_CONVERSATION_RESET)
    .eq("id", conversationId);
  if (wipeErr || rowErr) {
    return { ok: false, error: (wipeErr ?? rowErr)?.message };
  }
  return { ok: true };
}
