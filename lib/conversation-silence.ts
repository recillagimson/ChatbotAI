/**
 * "Is the bot silent on this thread?" — the single source of truth for whether
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
 * Pure + dependency-free so it's safe in both server (pages, routes) and client
 * (inbox composer) bundles. Unit-tested in scripts/test-conversation-silence.ts.
 */
export interface ConversationSilenceInput {
  status?: string | null;
  confirmed_at?: string | null;
  bot_off_at?: string | null;
  user_muted_at?: string | null;
  tag?: string | null;
}

export function botReplySilenced(c: ConversationSilenceInput): boolean {
  return (
    c.status === "ai_paused" ||
    !!c.confirmed_at ||
    !!c.bot_off_at ||
    !!c.user_muted_at ||
    c.tag === "disqualified" ||
    c.tag === "bot"
  );
}
