// lib/lead-facts.ts
// Durable "known facts" memory for the DM bot — the robust fix for the bot
// re-asking things the lead already answered (a credit score they typed, a goal
// they named, a screenshot they sent). Two layers already existed (verbatim window
// + rolling prose summary), but prose can drift or negate, and evidence sent as an
// image was lost. This adds a THIRD, structured layer: a compact bullet list of the
// concrete things the LEAD has stated or shown, maintained in the background after
// every reply and injected into the system prompt with a hard "never re-ask these"
// rule. Because it's a positive, explicit list, the model can't misread it into
// re-asking.
//
// Multi-tenant: the extraction prompt is domain-neutral (no credit/funding
// vocabulary) so it works for any bot. Pure helpers (buildFactsPrompt,
// normalizeFacts, renderKnownFactsBlock) are unit-tested in scripts/test-lead-facts.ts;
// the async updateKnownFacts / refreshKnownFacts do the LLM + DB work.
//
// Self-contained like lib/memory.ts (reads env directly; imports only openaiChat).
import type { SupabaseClient } from "@supabase/supabase-js";
import { openaiChat } from "./openai";
import { HISTORY_TURNS } from "./memory";

/** Feature flag. Default ON; set LEAD_FACTS_ENABLED=false to disable the extraction
 *  (skips the background call + leaves the block empty) without a redeploy of logic. */
export const LEAD_FACTS_ENABLED: boolean = process.env.LEAD_FACTS_ENABLED !== "false";
/** Cheap background model — same default chain as the memory summarizer. */
export const LEAD_FACTS_MODEL =
  process.env.LEAD_FACTS_MODEL || process.env.OPENAI_DM_MODEL || "gpt-4.1-mini";
/** Hard caps so an over-eager model can't bloat the block. */
export const LEAD_FACTS_MAX_LINES = 14;
export const LEAD_FACTS_MAX_CHARS = 1200;
/** Only start tracking once there's a real exchange (avoids a call on the opener). */
export const LEAD_FACTS_MIN_MESSAGES = 3;

export interface FactMessage {
  role: string;
  content: string;
}

// --- pure helpers ----------------------------------------------------------

/** Label a message by speaker for the extractor transcript. */
function speaker(role: string): string {
  if (role === "assistant") return "Business";
  if (role === "human_agent") return "Business (human agent)";
  return "Lead";
}

/**
 * Normalize raw model output into a clean, capped fact list. Strips a leading
 * "(none)" sentinel to empty, drops blank/preamble lines, forces a "- " bullet on
 * each line, de-dupes, and caps line count + total length. Returns "" when there's
 * nothing concrete. Pure + testable.
 */
export function normalizeFacts(raw: string | null | undefined): string {
  const text = (raw ?? "").replace(/\r/g, "").trim();
  if (!text) return "";
  // Whole-output "(none)" sentinel → nothing established.
  if (/^\(?\s*none\s*\)?\.?$/i.test(text)) return "";

  const seen = new Set<string>();
  const lines: string[] = [];
  for (const rawLine of text.split("\n")) {
    let line = rawLine.trim();
    if (!line) continue;
    // Drop a stray "(none)" line mixed into a real list.
    if (/^\(?\s*none\s*\)?\.?$/i.test(line)) continue;
    // Normalize any bullet marker (-, *, •, "1.") to a single "- ".
    line = line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim();
    if (!line) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(`- ${line}`);
    if (lines.length >= LEAD_FACTS_MAX_LINES) break;
  }
  let out = lines.join("\n");
  if (out.length > LEAD_FACTS_MAX_CHARS) out = out.slice(0, LEAD_FACTS_MAX_CHARS).trimEnd();
  return out;
}

/**
 * Build the extraction prompt: fold the existing facts + recent messages into an
 * updated list. Domain-neutral (multi-tenant). Pure (no I/O) so it's unit-testable.
 */
export function buildFactsPrompt(
  prevFacts: string | null,
  msgs: FactMessage[]
): { system: string; user: string } {
  const system =
    `You maintain a compact list of the CONCRETE things the LEAD (a potential ` +
    `customer) has stated or shown about themselves and what they want, from an ` +
    `Instagram/Messenger DM with a business. This list is fed back to the assistant so ` +
    `it NEVER re-asks something the lead already answered. Include only facts the LEAD ` +
    `actually provided: answers to the business's qualifying questions — their ` +
    `situation, any numbers/scores/amounts they gave, the goals/products/outcomes they ` +
    `want, timeline, budget, constraints — plus any decision or commitment they made. ` +
    `Content the lead sent as a photo, voice note, or document appears labelled ` +
    `"[Image]:", "[Voice message]:", or "[Attached document]:" — treat what it says as ` +
    `provided by the lead. Do NOT include the business's own questions or statements, ` +
    `greetings, small talk, or anything the lead did not actually say or show. Update ` +
    `the existing list: KEEP every fact that is still true, ADD new ones, and only ` +
    `change or drop a fact if the lead themselves superseded it. Output ONLY a terse ` +
    `list, one fact per line beginning with "- ", at most ${LEAD_FACTS_MAX_LINES} ` +
    `lines, no preamble or headers. If the lead has not stated anything concrete yet, ` +
    `output exactly "(none)".`;
  const prior = prevFacts?.trim() ? prevFacts.trim() : "(none)";
  const transcript = msgs.map((m) => `${speaker(m.role)}: ${m.content}`).join("\n");
  const user =
    `Existing known facts:\n${prior}\n\nRecent messages:\n${transcript}\n\n` +
    `Return the updated list only.`;
  return { system, user };
}

/**
 * Render the system-prompt block from a stored facts list. Empty facts → "" (no
 * block). The directive is deliberately strong: the whole point is to stop the bot
 * re-asking answered questions.
 */
export function renderKnownFactsBlock(facts: string | null | undefined): string {
  const f = (facts ?? "").trim();
  if (!f) return "";
  return (
    `WHAT THIS LEAD HAS ALREADY TOLD YOU (established from this chat — treat as known. ` +
    `NEVER ask for any of these again; reference them instead. If you catch yourself ` +
    `about to ask for something here, you already have it — use it and move forward. ` +
    `Re-asking makes the lead feel unheard.)\n${f}`
  );
}

// --- async: extract + refresh ----------------------------------------------

/**
 * Produce the next known-facts list from the previous one + recent messages. Cheap,
 * single call. Never throws — on any failure returns the previous facts unchanged so
 * nothing is lost.
 */
export async function updateKnownFacts(
  prevFacts: string | null,
  msgs: FactMessage[]
): Promise<string> {
  if (msgs.length === 0) return prevFacts ?? "";
  try {
    const { system, user } = buildFactsPrompt(prevFacts, msgs);
    const { text } = await openaiChat({
      model: LEAD_FACTS_MODEL,
      system,
      messages: [{ role: "user", content: user }],
      maxTokens: 350,
    });
    const next = normalizeFacts(text);
    // Guard against a transient empty/garbage completion wiping a good list: only
    // accept an empty result if we had nothing before (a real "(none)" start).
    if (!next) return prevFacts?.trim() ? prevFacts.trim() : "";
    return next;
  } catch (err) {
    console.error("[lead-facts] extract failed", err);
    return prevFacts ?? "";
  }
}

/**
 * Refresh a conversation's known-facts list from its recent history. Runs in the
 * background after a reply; best-effort — any failure is logged and swallowed (never
 * affects delivery). Uses the recent verbatim window (a fact can still be in-window),
 * merged with the stored list, so nothing is dropped as the chat scrolls.
 */
export async function refreshKnownFacts(ctx: {
  supabase: SupabaseClient;
  conversationId: string;
}): Promise<void> {
  if (!LEAD_FACTS_ENABLED) return;
  const { supabase, conversationId } = ctx;
  try {
    // Newest window of messages (same span the reply sees verbatim).
    const { data: recent } = await supabase
      .from("messages")
      .select("role, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_TURNS)
      .returns<{ role: string; content: string; created_at: string }[]>();
    if (!recent || recent.length < LEAD_FACTS_MIN_MESSAGES) return;
    const msgs = recent
      .slice()
      .reverse()
      .map((m) => ({ role: m.role, content: m.content }));

    const { data: conv } = await supabase
      .from("conversations")
      .select("known_facts")
      .eq("id", conversationId)
      .single<{ known_facts: string | null }>();

    const next = await updateKnownFacts(conv?.known_facts ?? null, msgs);
    // Skip the write when nothing changed (avoids a needless UPDATE + realtime ping).
    if ((next ?? "") === (conv?.known_facts ?? "")) return;
    await supabase
      .from("conversations")
      .update({ known_facts: next })
      .eq("id", conversationId);
  } catch (err) {
    console.error("[lead-facts] refresh failed", err);
  }
}
