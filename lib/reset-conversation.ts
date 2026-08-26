import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The column defaults a reset restores - i.e. fresh-conversation state. Identity
 * fields (user_id, chatbot_id, contact_*, manychat_subscriber_id, platform) are
 * deliberately NOT listed, so a reset keeps WHO the contact is and only wipes their
 * funnel progress. Single source of truth shared by the webhook RESET_KEYWORD path
 * and the admin "Reset conversation" button so the two can never drift.
 *
 * `bot_off_at` IS cleared: like `user_muted_at` and `status`, it is a funnel-silencing
 * flag (the webhook's bot-off gate fully silences a thread whenever it's set), not an
 * identity field - a "brand-new" contact is never bot-off, and leaving it set would let
 * a previously BOT_OFF-tagged thread silently swallow the very welcome/keyword/AI replies
 * the reset exists to re-test. (It mirrors a ManyChat tag, so it may re-sync to "off" on
 * the next tag-change webhook - an accepted, self-healing tradeoff.)
 *
 * The keyword-gate ENGAGEMENT flags are cleared for the same reason: the gate treats a
 * contact as engaged when ANY of `keyword_fired` (matched a keyword), `bot_forced_on_at`
 * (BOT_ON manual override), or `question_engaged_at` (answered as a genuine question) is
 * set - so a true first-contact reset must wipe ALL THREE, else the contact silently
 * bypasses the gate on their next message despite reading as "brand new". `bot_forced_on_at`
 * mirrors the BOT_ON tag (same self-healing re-sync tradeoff as bot_off_at);
 * `question_screen_count` resets to 0 so a reset contact can be screened afresh.
 *
 * ALL THREE MEMORY LAYERS must be listed here, not just the transcript. The bot's
 * recall of a contact is fed by (1) the verbatim message window, (2) `memory_summary`
 * (the rolling prose summary), and (3) `known_facts` - a durable bullet list of what the
 * lead stated or showed, injected into the system prompt with a hard "NEVER ask for any
 * of these again" rule (lib/lead-facts.ts). Layer 3 outlives a transcript wipe by design,
 * so leaving it set made a reset thread open by reciting the previous conversation's
 * details ("you've got late payments and that $2,700 bill") with nothing on screen to
 * explain where that came from. Anything added later that is fed back into the prompt
 * belongs in this list too - the transcript delete alone is NOT a memory wipe.
 */
export const FRESH_CONVERSATION_RESET: Record<string, unknown> = {
  confirmed_at: null,
  confirmed_by: null,
  tag: "lead",
  welcomed_at: null,
  user_muted_at: null,
  bot_off_at: null,
  bot_forced_on_at: null,
  status: "active",
  keyword_fired: [],
  question_engaged_at: null,
  question_screen_count: 0,
  is_lead: false,
  followup_step_index: 0,
  followup_count: 0,
  last_followup_at: null,
  // Which of the two drip sequences a thread is on: once set, the cron runs the
  // post-link steps. A "brand new" contact has not been sent a link.
  link_sent_at: null,
  start_on: null,
  start_note: null,
  // Two-strike disqualify counter (lib/conversation-screen.ts). A reset thread is a
  // fresh first-contact, so any half-accumulated strike must be cleared too.
  disqualify_strikes: 0,
  memory_summary: null,
  memory_summary_at: null,
  known_facts: null,
  // Layer 4: the question ledger (which questions this bot already asked this lead).
  // Same rule as the three memory layers above - it is fed back into the prompt, so a
  // reset thread must not resume mid-flow with "you already told me" for a wiped chat.
  flow_state: null,
  flow_state_at: null,
  extraction_attempts: 0,
  // Counted separately from the all-tier total because the graceful stand-down
  // fires on the Nth BLATANT attempt. Left stale, a reset thread carrying one
  // prior hard attempt would auto-pause on its very first, tripping the
  // threshold on what reads as a first-contact conversation.
  extraction_hard_attempts: 0,
  flagged_at: null,
  reply_claimed_for: null,
  rn_opt_in_at: null,
  rn_topic_id: null,
  unread_count: 0,
};

/** PostgREST (schema cache) and Postgres codes for "no such column". */
const MISSING_COLUMN_CODES = new Set(["PGRST204", "42703"]);

/**
 * Name the column an error is complaining about, or null if it isn't that kind of
 * error. Both wordings quote it - PostgREST's "Could not find the 'x' column of
 * 'conversations' in the schema cache" and Postgres's `column "x" of relation ...
 * does not exist` - and the result is checked against the payload, so a reworded
 * message falls back to a scan rather than being mistaken for something else.
 */
export function missingColumnFrom(
  error: { code?: string | null; message?: string | null },
  keys: string[]
): string | null {
  if (!MISSING_COLUMN_CODES.has(error.code ?? "")) return null;
  const message = error.message ?? "";
  const quoted = /['"`]([a-zA-Z0-9_]+)['"`]/.exec(message)?.[1];
  if (quoted && keys.includes(quoted)) return quoted;
  return keys.find((key) => message.includes(key)) ?? null;
}

/**
 * Write the fresh-conversation defaults, dropping any column this database does not
 * have and retrying.
 *
 * This helper hard-depends on a long tail of migrations, and a single unapplied one
 * would otherwise fail the WHOLE update - breaking reset entirely on exactly the
 * stuck threads it exists to recover, and over a column that by definition holds no
 * stale data. A column that does not exist has nothing to wipe, so skipping it is
 * always the correct outcome; it is logged so an unapplied migration is visible
 * rather than silent. Every other error still fails loudly.
 */
async function applyFreshDefaults(
  supabase: SupabaseClient,
  conversationId: string
): Promise<{ ok: boolean; error?: string; skipped: string[] }> {
  const payload: Record<string, unknown> = { ...FRESH_CONVERSATION_RESET };
  const skipped: string[] = [];

  // At most one pass per column, so a persistently odd error can't loop.
  for (let attempt = 0; attempt <= Object.keys(FRESH_CONVERSATION_RESET).length; attempt += 1) {
    const { error } = await supabase
      .from("conversations")
      .update(payload)
      .eq("id", conversationId);
    if (!error) return { ok: true, skipped };

    const missing = missingColumnFrom(error, Object.keys(payload));
    if (!missing) return { ok: false, error: error.message, skipped };

    delete payload[missing];
    skipped.push(missing);
    console.warn(
      `[reset-conversation] conversations.${missing} does not exist - skipping it. ` +
        "Apply the migration that adds it."
    );
    if (Object.keys(payload).length === 0) {
      return { ok: false, error: "no resettable columns exist on conversations", skipped };
    }
  }
  return { ok: false, error: `too many missing columns: ${skipped.join(", ")}`, skipped };
}

/**
 * Wipe a conversation back to true first-contact state: restore
 * {@link FRESH_CONVERSATION_RESET} and delete its transcript. Returns `{ ok:false, error }`
 * on any DB failure - supabase-js resolves errors instead of throwing, so a silent RLS
 * deny or transient error would otherwise read as a false success on the exact stuck
 * thread a reset exists to recover. Callers surface the failure honestly.
 *
 * Ordering matters for partial-failure safety: the **reversible** row update runs FIRST,
 * and the **irreversible** transcript delete runs only if it succeeded. So a failure
 * never leaves the transcript deleted while the funnel flags stay stale - the caller
 * simply retries, and the worst case (row reset, delete still pending) self-heals on the
 * next attempt. The error message names which step failed.
 *
 * Authorization is the CALLER's responsibility (the webhook's RESET_KEYWORD match, or the
 * requireSuperadmin gate on the reset route) - this helper does not gate.
 */
export async function resetConversation(
  supabase: SupabaseClient,
  conversationId: string
): Promise<{ ok: boolean; error?: string }> {
  // 1. Restore fresh-conversation defaults (identity fields kept). Reversible, so it
  //    goes first: if it fails we bail with the transcript still intact.
  const row = await applyFreshDefaults(supabase, conversationId);
  if (!row.ok) return { ok: false, error: `row reset failed: ${row.error}` };

  // 2. Wipe the transcript so the next inbound is a true first contact. Irreversible,
  //    so it runs only after the row reset succeeded.
  const { error: wipeErr } = await supabase
    .from("messages")
    .delete()
    .eq("conversation_id", conversationId);
  if (wipeErr) return { ok: false, error: `transcript wipe failed: ${wipeErr.message}` };

  return { ok: true };
}
