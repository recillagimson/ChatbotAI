import type { Conversation } from "./types";

/**
 * The subset of a conversation that determines whether the bot is intentionally
 * silenced for a contact. Any one of these being set means "do not auto-reply".
 */
export type SuppressionSnapshot = Pick<
  Conversation,
  "status" | "user_muted_at" | "bot_off_at" | "confirmed_at" | "tag"
>;

/**
 * When a ManyChat contact is deleted and the person messages again, ManyChat
 * issues a BRAND-NEW subscriber_id, so our webhook creates a fresh conversation
 * row with every silence flag empty - and the bot resumes even though the owner
 * had paused the old thread. When we can re-identify the returning person (a
 * stable external_user_id), we copy the prior thread's SILENCE STATE onto the new
 * row so the pause survives the deletion.
 *
 * This carries ONLY the fields the webhook's 6-* gates read to stay silent - never
 * the transcript (owner chose "keep the pause", not a thread merge):
 *   - status 'ai_paused'  -> gate 6 (human takeover / extraction stand-down)
 *   - user_muted_at       -> gate 6-mute (lead's own "stopmessage" opt-out)
 *   - bot_off_at          -> gate 6-bot-off (ManyChat BOT_OFF tag)
 *   - confirmed_at        -> gate 6-subscribed (converted customer)
 *   - tag subscribed/disqualified/bot -> gate 6-subscribed / 6-disqualified + display
 *
 * An EMPTY object means the prior thread was not silenced, so the returning
 * contact should behave like a brand-new lead (no carry-over). We read the prior
 * row's CURRENT state, so a thread the owner has since un-paused correctly carries
 * nothing.
 */
export function suppressionCarry(
  prior: Partial<SuppressionSnapshot> | null | undefined
): Partial<SuppressionSnapshot> {
  const carry: Partial<SuppressionSnapshot> = {};
  if (!prior) return carry;
  if (prior.status === "ai_paused") carry.status = "ai_paused";
  if (prior.user_muted_at) carry.user_muted_at = prior.user_muted_at;
  if (prior.bot_off_at) carry.bot_off_at = prior.bot_off_at;
  if (prior.confirmed_at) carry.confirmed_at = prior.confirmed_at;
  if (prior.tag === "subscribed" || prior.tag === "disqualified" || prior.tag === "bot") {
    carry.tag = prior.tag;
  }
  return carry;
}

/** True when the prior thread carries at least one active silence state. */
export function isSuppressed(
  prior: Partial<SuppressionSnapshot> | null | undefined
): boolean {
  return Object.keys(suppressionCarry(prior)).length > 0;
}

/**
 * Pick the STABLE identity for a contact from the webhook's already-cleaned fields.
 * Prefers an explicitly-mapped platform id (external_user_id / psid / ig_id /
 * messenger_id - trusted as-is, the owner chose it). Otherwise falls back to
 * `username`, which the owner maps to a stable id (Messenger PSID / Instagram @handle)
 * on BOTH platforms.
 *
 * The username fallback is gated to a SINGLE TOKEN (no internal whitespace): real PSIDs
 * and @handles never contain spaces, but some other bot's flow might map a free-text
 * display NAME ("John Smith") into username - and using that as an identity could make
 * two different same-named contacts on one bot collide and wrongly inherit a pause. The
 * guard accepts the stable ids and rejects multi-word names. Returns null when nothing
 * stable is available (then the contact behaves like a brand-new lead).
 */
export function resolveExternalId(fields: {
  externalUserId?: string | null;
  psid?: string | null;
  igId?: string | null;
  messengerId?: string | null;
  username?: string | null;
}): string | null {
  const explicit =
    fields.externalUserId || fields.psid || fields.igId || fields.messengerId;
  if (explicit) return explicit;
  const u = fields.username;
  if (u && !/\s/.test(u)) return u;
  return null;
}
