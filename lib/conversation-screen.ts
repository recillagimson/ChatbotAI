/**
 * Pre-reply "disqualify screen": a best-effort AI check on a DM lead's LATEST
 * message that decides whether the automated assistant should STOP replying to
 * this person entirely — because they are abusive, have clearly rejected the
 * service, or are themselves an automated bot. Runs BEFORE reply generation (see
 * the webhook pre-gate) so the offending message gets no reply at all.
 *
 * Fail-open by construction: parseScreen never throws and screenDisqualify
 * catches everything, both defaulting to { outcome: "none" } — an API error or
 * junk reply yields a NORMAL reply, never a wrongful silence. Multi-tenant: the
 * prompt is generic (no client keyword/persona/offer), so it screens for every bot.
 */
import { openaiChat } from "./openai";

const SCREEN_MODEL = process.env.CONFIRM_DETECT_MODEL || "gpt-4.1-mini";

/** disqualified = abusive OR a clear rejection; bot = detected automation/spam. */
export type ScreenOutcome = "none" | "disqualified" | "bot";
export interface ScreenResult {
  outcome: ScreenOutcome;
}

/**
 * Map the model's one-word reply to an outcome. Pure + defensive: any
 * malformed/junk input yields { outcome: "none" }. `abusive`/`not_interested`
 * map to `disqualified`; a whole-word `bot` maps to `bot`; everything else to
 * `none`. Order matters: a rejection outranks a bot mention.
 *
 * Whole-word matched and negation-aware so a hedged reply never inverts: the
 * model occasionally answers "not abusive" / "non-abusive" (meaning a NORMAL
 * lead), which a substring check would wrongly read as a disqualify. Because a
 * false `disqualified` is terminal + silences the bot, we bias hard toward
 * `none`. Unit-tested in scripts/test-screen-parse.ts.
 */
export function parseScreen(raw: string | null | undefined): ScreenResult {
  if (!raw) return { outcome: "none" };
  const s = raw.toLowerCase();
  if (/\bnot[_\s]interested\b/.test(s)) return { outcome: "disqualified" };
  // "abusive" -> disqualify, UNLESS negated ("not abusive", "non-abusive").
  if (/\babusive\b/.test(s) && !/\b(?:not|non-?)\s*abusive\b/.test(s)) {
    return { outcome: "disqualified" };
  }
  if (/\bbot\b/.test(s)) return { outcome: "bot" };
  return { outcome: "none" };
}

export async function screenDisqualify(opts: {
  message: string;
  lastBotMessage: string;
}): Promise<ScreenResult> {
  const text = (opts.message ?? "").trim();
  if (!text) return { outcome: "none" };
  try {
    const { text: out } = await openaiChat({
      model: SCREEN_MODEL,
      system:
        "You screen a DM lead's LATEST message and decide whether the automated " +
        "assistant should STOP replying to this person entirely. Answer with ONE word:\n" +
        "- abusive        = the person is HOSTILE TOWARD the assistant/company or is mocking/trolling the bot with NO genuine interest: direct insults ('you're useless', 'dumb bot', 'stupid AI', 'f*** you'), telling the assistant off, slurs, or harassment. Requires hostility aimed AT the assistant — not merely strong language.\n" +
        "- not_interested = clearly and explicitly rejects the service or says to stop messaging them. NOT mild hesitation, price pushback, 'maybe later', or venting from someone who still wants help.\n" +
        "- bot            = the sender is itself an automated bot or spam: nonsensical, repetitive, link-spam, canned automation, or non-sequitur replies that don't track the conversation.\n" +
        "- none           = anything else. A real person with ANY genuine interest, questions, negotiation, venting, or frustration — EVEN with heavy profanity — who still wants help is 'none'.\n" +
        "Swearing is NOT abusive by itself. Profanity used to vent or describe their OWN situation ('this s*** is stressing me out', 'a lot of old s*** to deal with', 'my situation is f***ed') is a normal frustrated lead → none. Only count cursing as abusive when it is aimed AT the assistant as an insult.\n" +
        "Be very conservative — answer 'abusive' or 'not_interested' ONLY when it is UNMISTAKABLE; when in doubt, none. Reply with ONLY the one word.",
      messages: [
        {
          role: "user",
          content: `Assistant said: ${opts.lastBotMessage}\n\nLead replied: ${text}\n\nOne word:`,
        },
      ],
      maxTokens: 6,
      timeoutMs: 8_000,
    });
    return parseScreen(out);
  } catch {
    return { outcome: "none" };
  }
}
