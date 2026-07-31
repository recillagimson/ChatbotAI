import type { TrainingPair } from "./types";

/**
 * Render enabled training pairs into a TRAINED RESPONSES system-prompt block. Pure -
 * unit-testable without the model. Returns "" when there are no usable enabled pairs
 * (so buildSystemPrompt skips it). Placed AFTER the knowledge base and declares
 * precedence over it, because a trained pair is an owner correction. Kept stable-per-bot
 * so the ephemeral prompt cache still hits.
 */
/**
 * Is this training pair usable - enabled AND with a non-empty scenario AND a
 * non-empty reply? training_pairs is schemaless JSONB, so every string field is
 * checked defensively (typeof) - a malformed row is simply unusable, never throws.
 * Single source of truth: renderTrainedResponses, the trainer's "will be skipped"
 * warning, and the preview diagnostics all use THIS so their counts agree.
 */
export function isUsableTrainingPair(p: TrainingPair | null | undefined): boolean {
  return !!(
    p &&
    p.enabled &&
    typeof p.scenario === "string" &&
    p.scenario.trim() &&
    typeof p.reply === "string" &&
    p.reply.trim()
  );
}

export function renderTrainedResponses(
  pairs: TrainingPair[] | null | undefined
): string {
  const enabled = Array.isArray(pairs) ? pairs.filter(isUsableTrainingPair) : [];
  if (enabled.length === 0) return "";
  const lines = enabled.map((p) => {
    const head = `- Scenario: ${p.scenario.trim()}`;
    // "exact" = word-for-word. Otherwise a STRONG (not loose) instruction: use the
    // owner's answer content and keep its facts/offers/links, but allow the bot's
    // own voice. This is why an edited reply actually shows up instead of being
    // paraphrased away.
    const say = p.exact
      ? `\n  Reply with this word for word - do not reword, shorten, add to it, or change any part: ${p.reply.trim()}`
      : `\n  Answer with this - keep its facts, offers, links, and main points, and say it in your own natural voice (you may adjust wording and tone, but do not drop, weaken, or contradict any of it): ${p.reply.trim()}`;
    const badReply = typeof p.bad_reply === "string" ? p.bad_reply.trim() : "";
    const avoid = badReply
      ? `\n  (You previously answered this, which the owner rejected - do not repeat it: ${badReply})`
      : "";
    return head + say + avoid;
  });
  return (
    `TRAINED RESPONSES (owner-approved corrections. When the contact's message clearly matches one of the scenarios below, ` +
    `use that scenario's answer for this turn - it takes precedence over the knowledge base and your usual phrasing for that ` +
    `scenario. Only apply a scenario when the contact is genuinely asking about it; otherwise answer normally from the ` +
    `persona and knowledge base.)\n` +
    lines.join("\n")
  );
}
