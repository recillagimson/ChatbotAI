/**
 * What the ManyChat webhook does with the model's answer for one turn. Pure.
 *
 * - A reply → sent as written.
 * - An EMPTY answer → silence. The call worked and the model chose to say nothing,
 *   usually because the client's prompt told it to ("go quiet so the human picks it
 *   up", a vendor pitch, "are you a bot" twice). Nothing is sent; the webhook flags
 *   the thread needs_human ("Needs attention") so a person picks it up.
 * - The call THREW (provider down, timeout, bad request after retries) → the canned
 *   fallback line, so a real outage never leaves a lead with no answer at all.
 *
 * Before 2026-09-28 an empty answer got the canned line too, which promised a
 * teammate nobody was sending and contradicted prompts that forbid exactly that line.
 */

/** The only canned line the bot sends on its own: when generating a reply FAILED. */
export const AI_FAILURE_FALLBACK = "Thanks for the message, a teammate will follow up shortly.";

export type AiReplyOutcome =
  | { kind: "reply"; text: string }
  | { kind: "silent" }
  | { kind: "fallback"; text: string };

/** `generated` is generateReply's result, or null when the call threw. */
export function resolveAiReply(generated: { text: string } | null): AiReplyOutcome {
  if (!generated) return { kind: "fallback", text: AI_FAILURE_FALLBACK };
  return generated.text.trim() ? { kind: "reply", text: generated.text } : { kind: "silent" };
}

/**
 * The text a RESPONSE channel (TikTok: no send API, the reply rides the webhook's HTTP
 * body) returns for a turn. `result` is the webhook's generateAndPersistReply result:
 * its text as-is ("" on a silent turn, which returns no message), or the canned line
 * when there is no result (processing threw, or the run stood down).
 */
export function responseChannelReply(result: { text: string } | null): string {
  return result ? result.text : AI_FAILURE_FALLBACK;
}
