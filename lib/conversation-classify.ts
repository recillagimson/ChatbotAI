/**
 * Best-effort AI classification of a DM lead's latest message into one of four
 * conversation tags. Generalizes the old confirm-detect yes/no classifier: a
 * `subscribed` result both tags the thread AND (via the caller) sets
 * conversations.confirmed_at, which stops the follow-up drip and — via the
 * webhook's subscribed gate — silences the bot. Conservative on `subscribed`
 * (when unsure, not a customer) so we never wrongly stop chasing a warm lead.
 *
 * Never throws; defaults to "lead" on doubt, an unrecognized reply, or an API
 * error. Paired with the manual tag control in the inbox (conversation-actions).
 */
import { openaiChat } from "./openai";
import { isTag, type ConversationTag } from "./conversation-tags";

const CLASSIFY_MODEL = process.env.CONFIRM_DETECT_MODEL || "gpt-4.1-mini";

export async function classifyConversation(opts: {
  userMessage: string;
  botReply: string;
}): Promise<ConversationTag> {
  const text = (opts.userMessage ?? "").trim();
  if (!text) return "lead";
  try {
    const { text: out } = await openaiChat({
      model: CLASSIFY_MODEL,
      system:
        "You classify a sales/DM lead's LATEST message into exactly one tag:\n" +
        "- subscribed  = they CLEARLY converted: paid, signed up, joined, or confirmed purchasing the paid program/community. Conservative — when unsure, do NOT pick this.\n" +
        "- needs_human = they are angry or frustrated, explicitly ask for a human/real person, or raise a complex issue the bot can't resolve.\n" +
        "- wants_call  = they want to book or schedule a call, appointment, or demo.\n" +
        "- lead        = anything else (interested, asking questions, negotiating price, vague positivity).\n" +
        'Reply with ONLY one word: "subscribed", "needs_human", "wants_call", or "lead".',
      messages: [
        {
          role: "user",
          content: `Assistant said: ${opts.botReply}\n\nLead replied: ${text}\n\nTag:`,
        },
      ],
      maxTokens: 3,
      timeoutMs: 8_000,
    });
    const word = (out ?? "").trim().toLowerCase().replace(/[^a-z_]/g, "");
    return isTag(word) ? word : "lead";
  } catch {
    return "lead";
  }
}
