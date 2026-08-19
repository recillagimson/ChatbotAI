// lib/flow-state.ts
// The QUESTION LEDGER - a compact, per-turn record of which questions THIS business
// has already asked THIS lead, which the lead actually answered, and which are still
// owed. It exists because a bot whose whole sales flow lives as prose (a long persona
// + a large knowledge base) holds no state: every turn the model has to re-derive
// "which step am I on / what did they already answer" from the raw transcript, and it
// gets that wrong - the same question asked three times in a row, or a step skipped
// because the lead answered obliquely. Adding more prose to close a gap just perturbs
// what was already there. So the position is tracked OUTSIDE the prose, in two layers:
//
//   Layer A (deterministic, cannot be stale): pure arithmetic over the persisted
//     transcript, computed on THIS turn by the caller - the last question the bot
//     actually sent, word for word, and how many of its last 3 messages carried it.
//     "You have sent this same question in your last 3 messages" is a string
//     comparison, not a judgement, so the headline symptom is closed by construction.
//     Note the LIMIT of that: a repeat is all Layer A can prove. It is built from the
//     bot's own messages with the lead's turns filtered out, so it cannot tell a
//     stonewalled question from a recurring confirm the lead answered every time
//     ("Sound good?"). Whether the question is still UNANSWERED is Layer B's call -
//     see ledgerCorroboratesUnanswered, which gates that half of the wording.
//   Layer B (best-effort, one turn behind): the stored ledger on
//     conversations.flow_state, re-derived in the background after each reply from the
//     recent message window. It states how old it is in its own header and declares
//     the conversation the winner on any disagreement.
//
// Multi-tenant (CLAUDE.md #12): everything here is domain-neutral. The only fixed
// strings are the three statuses, the "(none)" sentinel, the extraction prompt and the
// block headers - grep the module for a client literal and you find none. Every
// tenant-flavoured word in a rendered ledger is a kebab label the extractor coined at
// runtime from that tenant's own transcript.
//
// GOTCHAS a future reader needs:
//  - The flag is checked on BOTH the write side (refreshFlowState) and the render side
//    (renderFlowStateBlock). This is the deliberate non-copy of LEAD_FACTS_ENABLED,
//    which gates only the writer - so flipping THAT off leaves stale facts injected
//    forever. Flipping this one off genuinely stops injection on the next request.
//  - updateFlowState returns null on failure, never the previous value, so the caller
//    can tell "nothing to store" from "the extraction failed" and leave the freshness
//    stamp alone. Contrast lib/memory.ts, whose summarizer returns the OLD summary on
//    failure and whose caller then advances a watermark past messages that were never
//    summarized. That class of permanent loss is impossible here because the extractor
//    always re-reads the same fixed window: flow_state_at is a freshness stamp + a CAS
//    token, NOT a "skip these messages" watermark.
//  - RE-DERIVE, NEVER APPEND. Both layers rebuild from scratch every run, which is why
//    a skipped hook (a canned reply, a stand-down, a killed background function)
//    self-heals on the next turn instead of leaving the ledger permanently wrong.
//
// Self-contained like lib/lead-facts.ts (reads env directly; imports only openaiChat,
// HISTORY_TURNS and the model registry). Pure helpers are separated from the async
// LLM/DB work and unit-tested in tests/flow-state.spec.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { openaiChat } from "./openai";
import { HISTORY_TURNS } from "./memory";
import { MODELS } from "./model-tiers";

/** Cheap background model - same default chain as the other extractors. */
export const FLOW_STATE_MODEL = MODELS.flowState();
/** Hard caps so an over-eager model can't bloat the block. */
export const FLOW_STATE_MAX_ITEMS = 12;
export const FLOW_STATE_MAX_LINE = 110;
export const FLOW_STATE_MAX_CHARS = 900;
/** Only start tracking once there's a real exchange (avoids a call on the opener). */
export const FLOW_STATE_MIN_MESSAGES = 4;
/** Above this many messages newer than the stored ledger, Layer B is dropped entirely -
 *  a ledger many turns behind is worse than no ledger. Layer A still renders. */
export const FLOW_STATE_MAX_STALE_TURNS = Number(process.env.FLOW_STATE_MAX_STALE_TURNS ?? 6);
/** Question repeats are counted across at most this many recent bot messages. */
export const FLOW_STATE_ASK_WINDOW = 3;

/**
 * How many asks make an unanswered question stalled rather than open. Two: the lead has
 * had the question and a follow-up and still has not answered, so a third ask is a nag.
 * Deliberately the same number the escalation line uses, so the two layers agree about
 * when a question is finished instead of contradicting each other in the same prompt.
 */
export const FLOW_STATE_STALLED_ASKS = 2;
/** Token-set Dice score at or above which two questions count as the same question. */
export const FLOW_STATE_SAME_QUESTION = 0.7;
/** Dice threshold for treating two ledger LABELS as the same question relabelled.
 *  Set from measured pairs: it must catch "tried-fixing" vs "tried-fixing-before"
 *  (0.76) while keeping "the-price" and "the-portal" (0.47) apart. */
export const FLOW_STATE_SAME_LABEL = 0.75;
/** Longest quoted question in the Layer A line. */
export const FLOW_STATE_MAX_QUESTION = 160;
/** Longest stored answer snippet per ledger item. */
export const FLOW_STATE_MAX_ANSWER = 60;

/**
 * Feature flag. Default OFF (the `=== "true"` shape of lib/followup.ts, not lead-facts'
 * `!== "false"`) because this layer steers what the bot says next, so a silent
 * default-on rollout is not acceptable. FLOW_STATE_CHATBOT_IDS optionally narrows it to
 * an allowlist of chatbot ids (comma-separated) - per-tenant isolation with zero schema
 * on `chatbots`. Checked on BOTH the write and the render side, so turning it off is a
 * real kill switch and not just a "stop updating" switch.
 */
export function flowStateEnabled(chatbotId?: string | null): boolean {
  if (process.env.FLOW_STATE_ENABLED !== "true") return false;
  const only = (process.env.FLOW_STATE_CHATBOT_IDS ?? "").trim();
  if (!only) return true;
  return !!chatbotId && only.split(",").map((s) => s.trim()).includes(chatbotId);
}

export type FlowStatus = "answered" | "open" | "refused";

export interface FlowItem {
  status: FlowStatus;
  /** How many times the business has asked it, clamped 1..9. */
  asks: number;
  /** 1-4 lowercase hyphenated words the extractor coined from the business's wording. */
  label: string;
  /** The lead's answer in the extractor's words; "" for anything not answered. */
  answer: string;
}

export interface FlowMessage {
  role: string;
  content: string;
}

const STATUSES = new Set<string>(["answered", "open", "refused"]);
const LABEL_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

// --- pure helpers ----------------------------------------------------------

/** Label a message by speaker for the extractor transcript (mirrors lib/lead-facts.ts). */
function speaker(role: string): string {
  if (role === "assistant") return "Business";
  if (role === "human_agent") return "Business (human agent)";
  return "Lead";
}

/** Whole-output "(none)" sentinel - a legitimately EMPTY ledger, not a failure. */
function isNoneSentinel(text: string): boolean {
  return /^\(?\s*none\s*\)?\.?$/i.test(text);
}

/**
 * Parse the stored line-oriented ledger (one `status|asks|label|answer` per line).
 * Strict on purpose: a line that doesn't match is DROPPED rather than guessed at, so
 * one bad completion degrades to a shorter ledger instead of a wrong one. De-dupes by
 * label (last wins, first-seen order preserved) so a re-derivation that upgrades
 * open -> answered replaces the earlier line. Pure + testable.
 */
export function parseFlowState(raw: string | null | undefined): FlowItem[] {
  const text = (raw ?? "").replace(/\r/g, "").trim();
  if (!text || isNoneSentinel(text)) return [];

  const order: string[] = [];
  const byLabel = new Map<string, FlowItem>();
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    // Tolerate a model that fenced its output; never tolerate a malformed item.
    if (line.startsWith("```")) continue;
    if (isNoneSentinel(line)) continue;

    const fields = line.split("|");
    if (fields.length < 3) continue;
    const status = fields[0].trim().toLowerCase();
    if (!STATUSES.has(status)) continue;

    const label = fields[2].trim().toLowerCase().replace(/\s+/g, "-");
    if (!LABEL_RE.test(label)) continue;

    const parsedAsks = parseInt(fields[1].trim(), 10);
    const asks = Number.isFinite(parsedAsks) ? Math.min(9, Math.max(1, parsedAsks)) : 1;

    // Everything past the 3rd separator is the answer (the model occasionally puts a
    // "|" inside it; strip rather than lose the whole line). Non-answered statuses
    // carry no answer at all - an "open" question by definition has none.
    const answerRaw = fields.slice(3).join(" ");
    const answer =
      status === "answered"
        ? answerRaw
            .replace(/[|\n]/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, FLOW_STATE_MAX_ANSWER)
        : "";

    if (!byLabel.has(label)) order.push(label);
    byLabel.set(label, { status: status as FlowStatus, asks, label, answer });
  }
  return mergeNearDuplicates(order.map((l) => byLabel.get(l)!));
}

/**
 * Collapse two lines that are the same question relabelled. Scope is deliberately
 * narrow: this is a STRING comparison, so it catches a label that grew or lost a
 * word between turns ("tried-fixing" -> "tried-fixing-before", 0.76; "what-came-off"
 * -> "what-came-off-yet", 0.86) and nothing else. Two labels for one question that
 * share no wording do NOT collapse here - measured, "previous-fixes" vs
 * "tried-fixing-before" scores 0.26, far below any threshold that still keeps
 * "the-price" and "the-portal" apart (0.47). That case is the extractor prompt's job
 * ("ONE LINE PER QUESTION"), not this function's, and the prompt is the only defence
 * against it.
 *
 * The earlier label wins (it is what the ledger has been carrying), asks are summed
 * so a re-ask still escalates, and an answered line beats an open one because the
 * lead cannot un-say something.
 */
function mergeNearDuplicates(items: FlowItem[]): FlowItem[] {
  const out: FlowItem[] = [];
  for (const item of items) {
    const twin = out.find(
      (kept) => diceCoefficient(kept.label.replace(/-/g, " "), item.label.replace(/-/g, " ")) >= FLOW_STATE_SAME_LABEL
    );
    if (!twin) {
      out.push({ ...item });
      continue;
    }
    twin.asks = Math.min(9, twin.asks + item.asks);
    if (twin.status !== "answered" && item.status === "answered") {
      twin.status = "answered";
      twin.answer = item.answer;
    } else if (twin.status === "answered" && !twin.answer && item.answer) {
      twin.answer = item.answer;
    }
  }
  return out;
}

/**
 * Serialize items back to the stored format, enforcing every cap on an ITEM boundary -
 * never a raw slice. This is the deliberate non-copy of lib/lead-facts.ts's
 * `out.slice(0, LEAD_FACTS_MAX_CHARS)`, which can store a half-truncated fact
 * ("- Their current score is 5") and then pin it as permanent truth under a "never
 * re-ask" rule. An over-long single line is dropped whole for the same reason.
 * Pure + testable.
 */
export function serializeFlowState(items: FlowItem[]): string {
  const lines: string[] = [];
  for (const it of items.slice(0, FLOW_STATE_MAX_ITEMS)) {
    const line = `${it.status}|${it.asks}|${it.label}|${it.answer}`;
    if (line.length > FLOW_STATE_MAX_LINE) continue;
    lines.push(line);
  }
  while (lines.length > 0 && lines.join("\n").length > FLOW_STATE_MAX_CHARS) lines.pop();
  return lines.join("\n");
}

/**
 * Normalize raw model output into the stored form. THREE-VALUED, and that is
 * load-bearing:
 *   ""     - a legitimately empty ledger (the model said "(none)": nothing asked yet)
 *   string - a real ledger
 *   null   - FAILURE (a blank completion, or prose that yielded no valid item)
 * `null` and `""` must never be conflated: null means "do not write", "" means "the
 * business has asked nothing". Pure + testable.
 */
export function normalizeFlowState(raw: string | null | undefined): string | null {
  const text = (raw ?? "").replace(/\r/g, "").trim();
  if (!text) return null;
  if (isNoneSentinel(text)) return "";
  const items = parseFlowState(text);
  if (items.length === 0) return null;
  return serializeFlowState(items);
}

/**
 * Build the extraction prompt: fold the existing ledger + recent messages into an
 * updated ledger. Domain-neutral (multi-tenant) - it can talk about questions asked,
 * answered and open, never about any tenant's subject matter. Pure (no I/O) so it's
 * unit-testable.
 *
 * The asymmetry at the end is the safety property: unsure -> "open" -> the bot asks.
 * A false "open" costs one redundant question; a false "answered" silently skips a step.
 */
export function buildFlowPrompt(
  prev: string | null,
  msgs: FlowMessage[]
): { system: string; user: string } {
  const system =
    `You maintain a QUESTION LEDGER for a DM between a business and a potential ` +
    `customer (the lead). Track ONLY questions the BUSINESS asked the LEAD. Ignore ` +
    `questions the lead asked the business, greetings, small talk, rhetorical ` +
    `questions, and any question the business immediately answered itself. Output one ` +
    `line per question, format: status|times_asked|short-label|the answer the lead gave ` +
    `in at most 8 words. "status" is "answered" if the lead supplied the information in ` +
    `any form - obliquely, partially, one word, or inside a photo, voice note or ` +
    `document (those arrive labelled "[Image]:", "[Voice message]:", "[Attached ` +
    `document]:"); "open" if the business asked and the lead has not supplied it; ` +
    `"refused" if the lead declined or dodged it twice. "short-label" is 1 to 4 ` +
    `lowercase words joined by hyphens, describing the question in YOUR OWN neutral ` +
    `words drawn from how the business phrased it. Never mark something answered from ` +
    `the business's own words.\n\n` +
    `BINDING AN ANSWER IS THE PART THAT GOES WRONG, so be strict about it. The answer ` +
    `must be something the LEAD said AFTER the business asked that question - never a ` +
    `message from before it. Never use the same lead message as the answer to more than ` +
    `one question. If you cannot point at a specific lead message that answers it, the ` +
    `status is "open" and the answer field is EMPTY. An "open" line with no answer is ` +
    `ALWAYS better than an "answered" line with a guess: a wrong answer makes the ` +
    `business act on something the lead never said. When a lead changes the subject ` +
    `instead of answering, that question stays "open".\n\n` +
    `A question the LEAD asked is never a line in this ledger, not even once the ` +
    `business has answered it. Drop it entirely rather than recording it as answered - ` +
    `lines like that crowd out the questions the business is actually waiting on.\n\n` +
    `ONE LINE PER QUESTION. If two lines would describe the same question in different ` +
    `words, output one line only, keeping the label you used first.\n\n` +
    `Never invent a question the business did not ask. The previous ledger is a ` +
    `hint, not a source of truth: where the recent messages show something different, ` +
    `the messages win. Keep a previous line unchanged only when its question does not ` +
    `appear in the recent messages. Never move a question from "answered" back to ` +
    `"open" unless the lead explicitly took the answer back. At most ` +
    `${FLOW_STATE_MAX_ITEMS} lines, no preamble, no headers. Output exactly "(none)" if ` +
    `the business has not asked the lead anything.`;
  const prior = prev?.trim() ? prev.trim() : "(none)";
  const transcript = msgs.map((m) => `${speaker(m.role)}: ${m.content}`).join("\n");
  const user =
    `Existing ledger:\n${prior}\n\nRecent messages:\n${transcript}\n\n` +
    `Return the updated ledger only.`;
  return { system, user };
}

/**
 * The last question the business actually SENT, word for word, out of one assistant
 * message. Bubbles are blank-line separated (the outbound convention, see
 * lib/message-split.ts), so scan them newest-first and return the last "...?" sentence
 * of the newest bubble that has one. Null when the message asked nothing.
 * Pure + testable.
 */
export function extractLastQuestion(assistantText: string): string | null {
  const text = (assistantText ?? "").replace(/\r/g, "");
  if (!text.includes("?")) return null;
  const bubbles = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const bubble = bubbles[i];
    const end = bubble.lastIndexOf("?");
    if (end === -1) continue;
    // Walk back to the end of the previous sentence so we quote the question only.
    let start = 0;
    for (let j = end - 1; j >= 0; j--) {
      if (".!?\n".includes(bubble[j])) {
        start = j + 1;
        break;
      }
    }
    const q = bubble.slice(start, end + 1).trim();
    if (q) return q.slice(0, FLOW_STATE_MAX_QUESTION);
  }
  return null;
}

/** Lowercase, strip punctuation + emoji, collapse whitespace. */
function normalizeQuestion(text: string): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Token-set Dice coefficient, 0..1. */
function diceCoefficient(a: string, b: string): number {
  const setA = new Set(normalizeQuestion(a).split(" ").filter(Boolean));
  const setB = new Set(normalizeQuestion(b).split(" ").filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const t of setA) if (setB.has(t)) shared++;
  return (2 * shared) / (setA.size + setB.size);
}

/**
 * How many of the recent bot messages carried (essentially) this same question.
 * `recentAssistantTexts` is the last few non-media assistant messages, NEWEST FIRST,
 * so the result is 0..FLOW_STATE_ASK_WINDOW. Each candidate is compared on its own last
 * question when it has one - comparing a whole multi-bubble message would dilute the
 * score. The match is a token-set Dice score rather than string equality because "do
 * not send it again in any wording" only works if a reworded repeat still reads as a
 * repeat. Pure + testable.
 */
export function countRecentAsks(recentAssistantTexts: string[], question: string): number {
  const q = question?.trim();
  if (!q) return 0;
  let n = 0;
  for (const candidate of recentAssistantTexts.slice(0, FLOW_STATE_ASK_WINDOW)) {
    const text = candidate ?? "";
    const c = extractLastQuestion(text) ?? text;
    if (diceCoefficient(c, q) >= FLOW_STATE_SAME_QUESTION) n++;
  }
  return n;
}

/**
 * The rows the ledger is folded from: everything EXCEPT outbound asset rows. Exported
 * as the single definition of that window so the PostgREST filter in refreshFlowState
 * and the caller's staleness count can never drift apart - they did, and the drift was
 * silent: asset rows are written after the assistant text row, so they are always newer
 * than flow_state_at, and one numbered proof set (MAX_AI_ASSETS, default 6) plus the
 * lead's next message aged the ledger past FLOW_STATE_MAX_STALE_TURNS the moment it was
 * written, dropping Layer B on exactly the media-heavy bots this exists for.
 */
export function isFoldedRow(m: { role: string; media_url?: string | null }): boolean {
  return !m.media_url || m.role === "user";
}

/**
 * How many folded messages are newer than the stored ledger - the number
 * renderFlowStateBlock turns into "current as of N messages ago". Pure + testable.
 */
export function countStaleTurns(
  rows: { role: string; media_url?: string | null; created_at: string }[],
  flowStateAt: string | null | undefined
): number {
  if (!flowStateAt) return 0;
  return rows.filter((m) => isFoldedRow(m) && m.created_at > flowStateAt).length;
}

/** Deterministic, code-generated age clause - never written by the model. */
function ageClause(staleTurns: number): string {
  if (staleTurns <= 0) return "It is current as of this turn.";
  const n = staleTurns === 1 ? "1 message" : `${staleTurns} messages`;
  return (
    `It is current as of ${n} ago, so the conversation below is NEWER than this ` +
    `record: if the two ever disagree, the conversation wins.`
  );
}

/**
 * Does Layer B independently agree that a question asked this many times is STILL
 * unanswered? Layer A can only prove a REPEAT (a string comparison over the bot's own
 * last messages); it cannot see whether the lead answered in between, because it is
 * built from assistant messages with the lead's turns filtered out. A bot that habitually
 * closes on a recurring confirm ("Sound good?", "Make sense?", "Want me to send it over?")
 * therefore scores the full window even when the lead answered every one of them.
 *
 * So the "no answer" half of the claim is only made when the ledger carries an open item
 * the extractor recorded as asked at least as many times - the extractor is the layer that
 * reads the lead's replies. No text matching between the question and a label: labels are
 * paraphrases the extractor coined, so matching them would be a second guess. When the
 * ledger is absent or too stale to render, there is no corroboration and the wording drops
 * to what Layer A can actually prove. Pure + testable.
 */
export function ledgerCorroboratesUnanswered(items: FlowItem[], askCount: number): boolean {
  return items.some((i) => i.status === "open" && i.asks >= askCount);
}

/**
 * The escalation ladder - ask once, rephrase once, then drop it. Chosen by arithmetic
 * (countRecentAsks), not by the model noticing it has repeated itself.
 *
 * Every rung states only what is actually established: the repeat count is Layer A's
 * string comparison and is always safe to assert; "still unanswered" is asserted only
 * when `unanswered` (see ledgerCorroboratesUnanswered) backs it. The instruction not to
 * send the question again is identical either way, so the behaviour the ladder exists to
 * produce does not depend on the stronger claim.
 */
function escalationLine(askCount: number, unanswered: boolean): string {
  if (askCount >= FLOW_STATE_ASK_WINDOW) {
    return (
      `YOU HAVE SENT THAT SAME QUESTION IN YOUR LAST ${FLOW_STATE_ASK_WINDOW} MESSAGES` +
      (unanswered ? ` AND THE RECORD ABOVE STILL SHOWS IT UNANSWERED` : ``) +
      `. Do not send it again in any wording. Either treat their last message as the ` +
      `answer and move on, or drop it and continue with what you already have.`
    );
  }
  if (askCount === 2) {
    return (
      `You asked that in your previous message too` +
      (unanswered ? ` and the record above still shows it unanswered` : ``) +
      `. That was its second outing, so it is done - do not send it a third time in ` +
      `any wording. Pick one: treat their reply as the answer and move on, or drop ` +
      `the question and carry on with what you already have.`
    );
  }
  return `If their newest message answers that, even indirectly, treat it as answered and move on.`;
}

/**
 * Render the system-prompt block. Returns "" when the feature is off for this bot, or
 * when there is nothing to say (no usable ledger AND no question sent last turn) - so a
 * bot with no scripted flow gets a byte-identical prompt to today.
 *
 * `stored` is conversations.flow_state (Layer B). `lastQuestion` / `askCount` describe
 * the live transcript on THIS turn (Layer A); the caller computes them because only the
 * caller has the transcript, and the flag is re-checked here so the renderer stays the
 * single choke point. Above FLOW_STATE_MAX_STALE_TURNS the stored ledger is dropped and
 * only Layer A renders.
 *
 * The three rule lines matter as much as the data: the failure that would make the bot
 * read like a form is it treating STILL OPEN as a checklist to march through.
 */
export function renderFlowStateBlock(args: {
  chatbotId: string;
  stored: string | null;
  staleTurns: number;
  lastQuestion: string | null;
  askCount: number;
}): string {
  if (!flowStateEnabled(args.chatbotId)) return "";

  const items =
    args.staleTurns > FLOW_STATE_MAX_STALE_TURNS ? [] : parseFlowState(args.stored);
  const question = args.lastQuestion?.trim() || "";
  if (items.length === 0 && !question) return "";

  const parts: string[] = [];
  const prose = (label: string) => label.replace(/-/g, " ");

  if (items.length > 0) {
    const open = items.filter(
      (i) => i.status === "open" && i.asks < FLOW_STATE_STALLED_ASKS
    );

    // The third rule line talks about the STILL OPEN section, so it only renders when
    // that section does - a rule about a section that is not there is exactly the kind
    // of dangling reference the model fills in with something of its own.
    parts.push(
      `FLOW STATE (automatic record of what YOU have already asked this person in this ` +
        `chat and what they gave back. ${ageClause(args.staleTurns)} It records only ` +
        `what was asked and answered. It never decides what to do next; your own ` +
        `instructions do that. Never mention this record or read it out.)\n` +
        `- Never ask again for anything under ALREADY ANSWERED. You have it. Use it and keep moving.\n` +
        `- A one word, partial, or indirect answer still counts as answered. If what they gave is enough to move forward, move forward.` +
        (open.length > 0
          ? `\n- STILL OPEN is not a checklist to march through. If they just asked YOU something, answer that first. Then pick up at most ONE open item, and only if it still matters. If one stopped mattering, let it go.`
          : ``)
    );

    const answered = items.filter((i) => i.status === "answered");
    if (answered.length > 0) {
      parts.push(
        `ALREADY ANSWERED (do not ask again):\n` +
          answered
            .map((i) => (i.answer ? `- ${prose(i.label)}: "${i.answer}"` : `- ${prose(i.label)}`))
            .join("\n")
      );
    }

    if (open.length > 0) {
      parts.push(
        `STILL OPEN (you asked once, no answer yet):\n` +
          open.map((i) => `- ${prose(i.label)}`).join("\n")
      );
    }

    // An item the lead has already been asked twice is not "still open" - they have had
    // two chances and did not answer. Left in the list above it becomes a nag magnet: a
    // measured replay had one question reach nine asks because the block kept
    // advertising it as unfinished business while the rule line only forbade marching
    // through the list. A prohibition with no destination does not hold, so stalled
    // items get their own section that says where to go instead.
    const stalled = items.filter(
      (i) => i.status === "open" && i.asks >= FLOW_STATE_STALLED_ASKS
    );
    const dead = [...stalled, ...items.filter((i) => i.status === "refused")];
    if (dead.length > 0) {
      parts.push(
        `ASKED AND NOT ANSWERED - STOP ASKING THESE. They have had their chances and ` +
          `the answer is not coming. Carry on with what you already know and take the ` +
          `conversation forward without them:\n` +
          dead
            .map((i) => `- ${prose(i.label)}${i.asks > 1 ? ` (asked ${i.asks}x)` : ""}`)
            .join("\n")
      );
    }
  } else {
    // Layer A only - there is no ledger yet, or the stored one is too far behind to
    // trust. Still worth saying, because Layer A is the part that cannot be stale.
    parts.push(
      `FLOW STATE (automatic record of what YOU have already asked this person in this ` +
        `chat. It never decides what to do next; your own instructions do that. Never ` +
        `mention this record or read it out.)`
    );
  }

  if (question) {
    parts.push(
      `LAST QUESTION YOU ACTUALLY SENT, WORD FOR WORD: "${question}"\n` +
        escalationLine(args.askCount, ledgerCorroboratesUnanswered(items, args.askCount))
    );
  }
  return parts.join("\n\n");
}

// --- async: extract + refresh ----------------------------------------------

/**
 * Produce the next ledger from the previous one + the recent messages. Cheap, single
 * call. Never throws. Returns null on ANY failure (throw, timeout, blank or
 * unparseable completion) and NEVER the previous value - the caller has to be able to
 * tell "nothing to store" from "the extraction failed", because a success stamps a
 * freshness timestamp the rendered block reports as its own age.
 */
export async function updateFlowState(
  prev: string | null,
  msgs: FlowMessage[]
): Promise<string | null> {
  if (msgs.length === 0) return null;
  try {
    const { system, user } = buildFlowPrompt(prev, msgs);
    const { text } = await openaiChat({
      model: FLOW_STATE_MODEL,
      system,
      messages: [{ role: "user", content: user }],
      maxTokens: 300,
      timeoutMs: 15_000,
    });
    return normalizeFlowState(text);
  } catch (err) {
    console.error("[flow-state] extract failed", err);
    return null;
  }
}

/**
 * Re-derive a conversation's question ledger from its recent history. Runs in the
 * background after a reply; best-effort - any failure is logged and swallowed (never
 * affects delivery).
 *
 * Note it re-reads the SAME fixed window every run rather than only the messages since
 * the last fold: flow_state_at is a freshness stamp + CAS token, not a watermark, so a
 * failed run can never strand messages outside every memory layer. The price of that
 * choice is one `conversations` UPDATE per replied turn on allowlisted bots (the stamp
 * has to advance for the block's stated age to be honest), unlike refreshKnownFacts
 * which skips an unchanged write. Recorded deliberately.
 */
export async function refreshFlowState(ctx: {
  supabase: SupabaseClient;
  conversationId: string;
  chatbotId: string;
}): Promise<void> {
  if (!flowStateEnabled(ctx.chatbotId)) return;
  const { supabase, conversationId, chatbotId } = ctx;
  try {
    // Newest window of CONVERSATIONAL messages. The filter drops OUTBOUND asset rows
    // only: one numbered proof set writes MAX_AI_ASSETS (default 6) assistant
    // "(sent image: key)" rows, which would otherwise fill most of the window with
    // rows carrying neither a question nor an answer. The lead's OWN media rows stay
    // - the webhook backfills that row's content with the transcript / document text
    // / image description, and buildFlowPrompt above explicitly tells the extractor
    // that an answer can arrive labelled "[Image]:" / "[Voice message]:" /
    // "[Attached document]:". A blanket `.is("media_url", null)` would delete the
    // rows that instruction is about, and would also desynchronise this window from
    // the caller's staleTurns count.
    const { data: recent } = await supabase
      .from("messages")
      .select("role, content, created_at")
      .eq("conversation_id", conversationId)
      .or("media_url.is.null,role.eq.user")
      .order("created_at", { ascending: false })
      .limit(HISTORY_TURNS)
      .returns<{ role: string; content: string; created_at: string }[]>();
    if (!recent || recent.length < FLOW_STATE_MIN_MESSAGES) return;

    const { data: conv } = await supabase
      .from("conversations")
      .select("flow_state, flow_state_at")
      .eq("id", conversationId)
      .single<{ flow_state: string | null; flow_state_at: string | null }>();
    const prev = conv?.flow_state ?? null;
    const prevAt = conv?.flow_state_at ?? null;

    const newestCreatedAt = recent[0].created_at;
    // Nothing new since the last fold - don't pay for a call that can't change anything.
    if (prevAt && newestCreatedAt <= prevAt) return;
    // The business has asked nothing in this window and there's no ledger to carry.
    if (!prev && !recent.some((m) => m.role !== "user" && m.content.includes("?"))) return;

    const msgs = recent
      .slice()
      .reverse()
      .map((m) => ({ role: m.role, content: m.content }));

    const next = await updateFlowState(prev, msgs);
    if (next === null) return; // extraction failed - leave the stored ledger + stamp alone

    // Compare-and-swap on the stamp we read, so a reset (or a concurrent run) landing
    // between that read and this write can't restore the state it just cleared. Same
    // guard and reasoning as refreshKnownFacts in lib/lead-facts.ts, but with a
    // .select("id") so a lost CAS is visible instead of silently no-opping.
    const write = supabase
      .from("conversations")
      .update({ flow_state: next, flow_state_at: newestCreatedAt })
      .eq("id", conversationId);
    const { data, error } = await (prevAt === null
      ? write.is("flow_state_at", null)
      : write.eq("flow_state_at", prevAt)
    ).select("id");
    if (error) {
      console.error("[flow-state] write failed", error);
    } else if (!data?.length) {
      console.warn("[flow-state] write superseded (CAS lost)", conversationId);
    } else {
      const items = parseFlowState(next);
      console.log(
        "[flow-state] items=%d open=%d bot=%s",
        items.length,
        items.filter((i) => i.status === "open").length,
        chatbotId
      );
    }
  } catch (err) {
    console.error("[flow-state] refresh failed", err);
  }
}
