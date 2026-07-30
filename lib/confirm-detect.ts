/**
 * Best-effort AI detection of a CONFIRMED lead, used to auto-stop the follow-up
 * drip. Conservative by design: returns true only on a clear conversion signal,
 * so we never stop chasing a warm-but-unclosed lead. Never throws.
 *
 * Paired with the manual "Mark confirmed" inbox action — either sets
 * conversations.confirmed_at, which excludes the conversation from the cron drip.
 */
import { openaiChat } from "./openai";
import { MODELS } from "./model-tiers";

const CONFIRM_MODEL = MODELS.classifier();

export async function detectLeadConfirmed(opts: {
  userMessage: string;
  botReply: string;
}): Promise<boolean> {
  const text = (opts.userMessage ?? "").trim();
  if (!text) return false;
  try {
    const { text: out } = await openaiChat({
      model: CONFIRM_MODEL,
      system:
        "You classify whether a sales/DM lead has CLEARLY converted into a confirmed customer in their latest message. " +
        "Converted = they explicitly agreed to proceed/buy, said they paid, booked, signed up, or confirmed the purchase. " +
        "NOT converted = merely interested, asking questions, 'maybe later', negotiating price, or vague positivity. " +
        'When in doubt, answer "no". Reply with ONLY the single word "yes" or "no".',
      messages: [
        {
          role: "user",
          content: `Assistant said: ${opts.botReply}\n\nLead replied: ${text}\n\nHas the lead clearly converted into a confirmed customer?`,
        },
      ],
      maxTokens: 3,
      timeoutMs: 8_000,
    });
    return /^\s*yes\b/i.test(out);
  } catch {
    return false;
  }
}
