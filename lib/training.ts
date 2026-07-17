import type { TrainingPair } from "./types";

/**
 * Render enabled training pairs into a TRAINED RESPONSES system-prompt block. Pure —
 * unit-testable without the model. Returns "" when there are no usable enabled pairs
 * (so buildSystemPrompt skips it). Placed AFTER the knowledge base and declares
 * precedence over it, because a trained pair is an owner correction. Kept stable-per-bot
 * so the ephemeral prompt cache still hits.
 */
export function renderTrainedResponses(
  pairs: TrainingPair[] | null | undefined
): string {
  // training_pairs is schemaless JSONB — treat every string field defensively
  // (typeof checks) so a malformed row can never throw at reply time.
  const enabled = Array.isArray(pairs)
    ? pairs.filter(
        (p) =>
          p &&
          p.enabled &&
          typeof p.scenario === "string" &&
          p.scenario.trim() &&
          typeof p.reply === "string" &&
          p.reply.trim()
      )
    : [];
  if (enabled.length === 0) return "";
  const lines = enabled.map((p) => {
    const head = `- Scenario: ${p.scenario.trim()}`;
    const say = p.exact
      ? `\n  Say this VERBATIM (do not reword, keep it exactly as written): ${p.reply.trim()}`
      : `\n  Answer along these lines, in your own natural voice: ${p.reply.trim()}`;
    const badReply = typeof p.bad_reply === "string" ? p.bad_reply.trim() : "";
    const avoid = badReply
      ? `\n  (You previously answered this, which the owner rejected — do not repeat it: ${badReply})`
      : "";
    return head + say + avoid;
  });
  return (
    `TRAINED RESPONSES (owner-corrected answers — when the contact's message fits a scenario below, answer as shown. ` +
    `These OVERRIDE the knowledge base above if they conflict.)\n` +
    lines.join("\n")
  );
}
