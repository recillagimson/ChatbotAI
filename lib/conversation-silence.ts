/**
 * "Is the bot silent on this thread?" - the single source of truth for whether
 * the automated assistant will NOT reply on its own to the next inbound message.
 * Mirrors the reactive-silence gates in the ManyChat webhook (route.ts):
 *   - status = ai_paused          → human takeover (gate 6)
 *   - confirmed_at set            → subscribed, stop replying (gate 6-subscribed)
 *   - bot_off_at set              → BOT_OFF tag (gate 6-bot-off)
 *   - tag = disqualified | bot    → dead thread (gate 6-disqualified)
 *   - user_muted_at set           → the lead texted "stopmessage" (mute gate)
 *
 * Deliberately EXCLUDES `starting_later` and `needs_human`: on those the AI still
 * replies reactively (only the follow-up drip is paused / the thread is flagged),
 * so surfacing a manual composer there would risk the owner AND the bot both
 * answering the same message.
 *
 * Two per-chatbot switches lift the tag silencers: `keep_replies_when_tagged`
 * (disqualified / Bot-Spam) and `keep_replies_when_subscribed` (subscribed). The
 * three explicit off-switches (ai_paused, bot_off_at, user_muted_at) always win.
 *
 * Pure + dependency-free so it's safe in both server (pages, routes) and client
 * (inbox composer) bundles. Pinned by tests/reply-gates.spec.ts.
 */
export interface ConversationSilenceInput {
  status?: string | null;
  confirmed_at?: string | null;
  bot_off_at?: string | null;
  user_muted_at?: string | null;
  tag?: string | null;
}

/** The chatbot switches that lift a tag's silence (a chatbots row, or part of one). */
export interface ReplySwitches {
  keep_replies_when_tagged?: boolean | null;
  keep_replies_when_subscribed?: boolean | null;
}

/**
 * Whether the bot keeps answering subscribed users. `keep_replies_when_subscribed`
 * (2026-09-29) split this out of `keep_replies_when_tagged`, which covered
 * subscribed too; on a database without the new column it reads as missing, so the
 * old switch still decides and nothing changes before the migration.
 */
export function keepsReplyingToSubscribed(bot: ReplySwitches | null | undefined): boolean {
  return (bot?.keep_replies_when_subscribed ?? bot?.keep_replies_when_tagged) === true;
}

export function botReplySilenced(
  c: ConversationSilenceInput,
  bot: ReplySwitches = {}
): boolean {
  // Explicit off-switches, never lifted by a chatbot switch:
  if (c.status === "ai_paused") return true; // human takeover
  if (c.user_muted_at) return true;          // lead opt-out (consent)
  if (c.bot_off_at) return true;             // explicit BOT_OFF tag
  // Tag silencers, each lifted by its own chatbot switch:
  if (c.confirmed_at && !keepsReplyingToSubscribed(bot)) return true;
  if ((c.tag === "disqualified" || c.tag === "bot") && bot.keep_replies_when_tagged !== true) return true;
  return false;
}
