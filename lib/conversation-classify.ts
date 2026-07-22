/**
 * Best-effort AI classification of a DM lead's latest message into a conversation
 * tag, and — for a deferred start ("Wednesday", "in a week") — the start date.
 *
 * A `subscribed` result both tags the thread AND (via the caller) sets
 * conversations.confirmed_at, which stops the follow-up drip and silences the bot.
 * A `starting_later` result pauses the drip (AI replies stay on) and carries a
 * start date the bot then remembers. Conservative on `subscribed` (when unsure,
 * not a customer). Never throws; defaults to `{ tag: "lead" }` on doubt, an
 * unrecognized reply, or an API error.
 */
import { openaiChat } from "./openai";
import { isTag, type ConversationTag } from "./conversation-tags";

const CLASSIFY_MODEL = process.env.CONFIRM_DETECT_MODEL || "gpt-4.1-mini";

/**
 * A `starting_later` start date must be near-term and in the future. A resolved
 * date further out than this is almost certainly a misread of a *duration* (e.g.
 * "I've had this 2 years" → a date ~2 years out), not a real deferred start — so
 * we fall back to `lead` and keep the follow-up drip running.
 */
export const START_HORIZON_DAYS = 400;

/** Whole days from YYYY-MM-DD `a` to `b` (b − a), UTC. NaN if either is unparseable. */
function daysBetween(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return NaN;
  return Math.round((tb - ta) / 86_400_000);
}

export interface ClassifyResult {
  tag: ConversationTag;
  /** ISO date (YYYY-MM-DD) the lead wants to start — only when tag = starting_later. */
  startOn: string | null;
  /** The human phrase the lead used ("Wednesday", "next month") — starting_later only. */
  startNote: string | null;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse the model's JSON reply into a ClassifyResult. Pure + defensive: any
 * malformed/junk input yields the safe default `{ tag: "lead", … }`.
 *
 * `starting_later` is only honoured when the model produced a CONCRETE, resolved
 * ISO start date — a vague deferral ("later", "soon", "after payday") carries no
 * date and stays a plain `lead` so the follow-up drip keeps running. When `today`
 * is supplied, a resolved date in the past or absurdly far out (a duration like
 * "2 years" misread as a start date, beyond START_HORIZON_DAYS) is likewise
 * demoted to `lead`. Unit-tested in scripts/test-classify-parse.ts.
 */
export function parseClassification(
  raw: string | null | undefined,
  today?: string
): ClassifyResult {
  const fallback: ClassifyResult = { tag: "lead", startOn: null, startNote: null };
  if (!raw) return fallback;
  let obj: unknown;
  try {
    // Tolerate code fences / stray prose around the JSON object.
    const match = raw.match(/\{[\s\S]*\}/);
    obj = JSON.parse(match ? match[0] : raw);
  } catch {
    return fallback;
  }
  if (!obj || typeof obj !== "object") return fallback;
  const rec = obj as Record<string, unknown>;
  const tagRaw = typeof rec.tag === "string" ? rec.tag.trim().toLowerCase() : "";
  const tag: ConversationTag = isTag(tagRaw) ? tagRaw : "lead";
  if (tag !== "starting_later") return { tag, startOn: null, startNote: null };
  const startOn = typeof rec.start_on === "string" && ISO_DATE_RE.test(rec.start_on.trim())
    ? rec.start_on.trim()
    : null;
  const startNote = typeof rec.start_note === "string" && rec.start_note.trim()
    ? rec.start_note.trim().slice(0, 60)
    : null;
  // A deferred start REQUIRES a concrete resolved date. No date = vague "later" =
  // keep chasing (lead), never pause the drip.
  if (!startOn) return fallback;
  // Reject a date in the past or beyond the near-term horizon (a misread duration).
  if (today) {
    const delta = daysBetween(today, startOn);
    if (Number.isNaN(delta) || delta < 0 || delta > START_HORIZON_DAYS) return fallback;
  }
  return { tag, startOn, startNote };
}

export async function classifyConversation(opts: {
  userMessage: string;
  botReply: string;
  /** Today's date (YYYY-MM-DD) so the model can resolve "Wednesday" → an ISO date. */
  today: string;
}): Promise<ClassifyResult> {
  const text = (opts.userMessage ?? "").trim();
  if (!text) return { tag: "lead", startOn: null, startNote: null };
  try {
    const { text: out } = await openaiChat({
      model: CLASSIFY_MODEL,
      system:
        "You classify a sales/DM lead's LATEST message into exactly one tag:\n" +
        "- subscribed     = the lead states or clearly indicates they have ALREADY COMPLETED payment or enrollment (a done action) — e.g. 'just paid', 'payment went through', 'I'm in, just signed up/joined', 'done, subscribed'. A promise, agreement, or intent is NOT enough: a bare 'yes'/'ok'/'sure'/'let's do it'/'I'll do it'/'send me the link' — especially right after the assistant sent a payment/checkout link or asked them to sign up — is INTENT to buy, so tag it 'lead', not 'subscribed'. When unsure, choose 'lead'.\n" +
        "- needs_human    = they are angry or frustrated, explicitly ask for a human/real person, or raise a complex issue the bot can't resolve.\n" +
        "- starting_later = the lead clearly wants to START/BEGIN the service or program, AND names a CONCRETE near-term date or day (e.g. 'tomorrow', 'Friday', 'next Monday', 'the 15th', 'next week', 'first of the month'). Use this ONLY when both are true.\n" +
        "  * A vague deferral with NO concrete date is NOT starting_later — 'later', 'soon', 'maybe', 'someday', 'when I'm ready', 'after I sort things out', 'after payday' all stay 'lead'.\n" +
        "  * Never treat a PAST time or a DURATION as a start date — 'I've had this for 2 years', 'haven't paid much mind in a while', 'recently', 'a couple years' describe how long something has been going on, NOT when they'll start. Tag 'lead'.\n" +
        "- wants_call     = they want to book or schedule a call, appointment, or demo (NOT a start date).\n" +
        "- lead           = anything else (interested, asking questions, negotiating price, vague positivity, a vague 'later' with no date).\n" +
        `Today is ${opts.today}. For starting_later ONLY, resolve their concrete date to a future YYYY-MM-DD; if they gave no concrete date, use tag 'lead'.\n` +
        'Reply with ONLY compact JSON: {"tag":"...","start_on":"YYYY-MM-DD or null","start_note":"short phrase or null"}. ' +
        "start_on/start_note are null unless tag is starting_later, and starting_later MUST have a start_on.",
      messages: [
        {
          role: "user",
          content: `Assistant said: ${opts.botReply}\n\nLead replied: ${text}\n\nJSON:`,
        },
      ],
      maxTokens: 60,
      timeoutMs: 8_000,
    });
    return parseClassification(out, opts.today);
  } catch {
    return { tag: "lead", startOn: null, startNote: null };
  }
}
