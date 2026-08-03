// lib/memory.ts
// Conversation memory for the DM bot. Two layers work together:
//  1) a wider VERBATIM window (HISTORY_TURNS) of recent messages sent as-is, and
//  2) a rolling prose SUMMARY of everything older than that window, stored on the
//     conversation row and injected into the system prompt.
//
// The summary is refreshed in the background AFTER a reply is sent (so the reply
// path stays fast) and only once a conversation grows past SUMMARY_TRIGGER_TURNS.
// Refresh is incremental: summarize(prev_summary + the messages that just fell
// out of the window), advancing a created_at watermark - so there's never a gap
// between "summarized" and "still shown verbatim".
//
// Self-contained on purpose: reads OPENAI_DM_MODEL from env directly rather than
// importing lib/anthropic, which imports HISTORY_TURNS from here (avoids a cycle).
import type { SupabaseClient } from "@supabase/supabase-js";
import { openaiChat } from "./openai";
import { MODELS } from "./model-tiers";

// Token cut (2026-08-03): trimmed HISTORY_TURNS from 20 to 10 - the verbatim
// window is the single biggest per-reply token cost after the KB, and 10 recent
// messages (~5 exchanges) is ample immediate context; everything older is carried
// by the rolling memory summary + known_facts.
//
// SUMMARY_TRIGGER_TURNS is HISTORY_TURNS + 1 on purpose. The summary covers only
// messages OLDER than the verbatim window and isn't written until a conversation
// reaches this count, so any offset ABOVE HISTORY_TURNS opens a transient window
// [HISTORY_TURNS+1 .. SUMMARY_TRIGGER_TURNS-1] where the oldest out-of-window turns
// are neither shown verbatim nor yet summarized. Keeping the offset at +1 makes
// that window empty (the summary engages the moment the verbatim window overflows).
// A trigger AT or BELOW HISTORY_TURNS is also gap-free - refreshConversationMemory's
// `window.length < HISTORY_TURNS` guard prevents a premature summary - but +1 is the
// smallest value that avoids the gap AND skips needless summary work on short chats.
// Both env-overridable.
/** Recent messages sent to the model verbatim on every reply. */
export const HISTORY_TURNS = Number(process.env.HISTORY_TURNS ?? 10);
/** Below this many messages the verbatim window still holds enough that no summary
 *  is needed. Kept at HISTORY_TURNS + 1 so the summary engages as soon as the
 *  window overflows (see note above). */
export const SUMMARY_TRIGGER_TURNS = Number(process.env.SUMMARY_TRIGGER_TURNS ?? 11);
/** Soft word budget for the running summary. */
export const SUMMARY_MAX_WORDS = 220;
/** Model for the (cheap, background) summarizer. */
export const MEMORY_SUMMARY_MODEL = MODELS.memory();

export interface SummaryMessage {
  role: string;
  content: string;
  created_at: string;
}

// --- pure helpers ----------------------------------------------------------

/**
 * The messages that have scrolled out of the verbatim window since the last
 * summary refresh: created_at strictly after the watermark and strictly before
 * the cutoff (= the oldest message still shown verbatim). Pure + testable.
 */
export function pendingForSummary<T extends { created_at: string }>(
  messages: T[],
  watermarkISO: string | null,
  cutoffISO: string
): T[] {
  const wm = watermarkISO ? Date.parse(watermarkISO) : -Infinity;
  const cut = Date.parse(cutoffISO);
  return messages.filter((m) => {
    const t = Date.parse(m.created_at);
    return t > wm && t < cut;
  });
}

/** Label a message by speaker for the summarizer transcript. */
function speaker(role: string): string {
  if (role === "assistant") return "Business";
  if (role === "human_agent") return "Business (human agent)";
  return "Lead";
}

/**
 * Build the summarizer prompt: fold prevSummary + the new messages into an
 * updated running summary. Pure (no I/O) so it's unit-testable.
 */
export function buildSummaryPrompt(
  prevSummary: string | null,
  newMsgs: Pick<SummaryMessage, "role" | "content">[]
): { system: string; user: string } {
  const system =
    `You maintain a running memory summary of an ongoing Instagram/Messenger DM ` +
    `conversation between a business and a potential customer (the "lead"). Update ` +
    `the summary so a teammate could read it and instantly know where things stand. ` +
    `Capture: the lead's name, what they want / their goal, their situation and any ` +
    `details they shared, what's been offered or promised, decisions made, and any ` +
    `open questions or next steps. PRESERVE the concrete specifics the lead gave - ` +
    `the numbers they cited, the exact goals, products, or items they named, amounts, ` +
    `and dates - verbatim; they carry over even after they scroll out of view, so a ` +
    `later summary must never drop them. Content the lead sent as a photo, voice note, ` +
    `or document arrives labelled "[Image]:", "[Voice message]:", or "[Attached ` +
    `document]:" - treat whatever it says as something the lead shared. Record only ` +
    `what HAS been shared: do not editorialize from your own vantage that details are ` +
    `missing or "haven't been provided yet" - simply omit anything you weren't told. ` +
    `BUT keep any gap the LEAD themselves stated (e.g. "I haven't pulled that yet", "I ` +
    `don't have that document") - those are real next steps. Be factual and concise - ` +
    `at most ${SUMMARY_MAX_WORDS} words, plain prose (no headers). Never invent ` +
    `anything not present in the text.`;
  const prior = prevSummary?.trim() ? prevSummary.trim() : "(none yet)";
  const transcript = newMsgs.map((m) => `${speaker(m.role)}: ${m.content}`).join("\n");
  const user =
    `Current summary:\n${prior}\n\nNew messages to fold in:\n${transcript}\n\n` +
    `Return the updated summary only.`;
  return { system, user };
}

// --- async: summarize + refresh -------------------------------------------

/**
 * Produce the next running summary from the previous one + the new messages.
 * Cheap, single call. Never throws - on any failure it returns the previous
 * summary unchanged so the caller can proceed.
 */
export async function summarizeConversation(
  prevSummary: string | null,
  newMsgs: Pick<SummaryMessage, "role" | "content">[]
): Promise<string> {
  if (newMsgs.length === 0) return prevSummary ?? "";
  try {
    const { system, user } = buildSummaryPrompt(prevSummary, newMsgs);
    const { text } = await openaiChat({
      model: MEMORY_SUMMARY_MODEL,
      system,
      messages: [{ role: "user", content: user }],
      maxTokens: 400,
    });
    return text.trim() || (prevSummary ?? "");
  } catch (err) {
    console.error("[memory] summarize failed", err);
    return prevSummary ?? "";
  }
}

/**
 * Refresh a conversation's rolling summary to cover everything older than the
 * verbatim window. Runs in the background after a reply; best-effort - any
 * failure is logged and swallowed (never affects delivery).
 */
export async function refreshConversationMemory(ctx: {
  supabase: SupabaseClient;
  conversationId: string;
}): Promise<void> {
  const { supabase, conversationId } = ctx;
  try {
    // Short conversations: the verbatim window already holds everything.
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);
    if (!count || count < SUMMARY_TRIGGER_TURNS) return;

    // Cutoff = created_at of the oldest message still in the verbatim window.
    const { data: window } = await supabase
      .from("messages")
      .select("created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_TURNS)
      .returns<{ created_at: string }[]>();
    if (!window || window.length < HISTORY_TURNS) return;
    const cutoff = window[window.length - 1].created_at;

    const { data: conv } = await supabase
      .from("conversations")
      .select("memory_summary, memory_summary_at")
      .eq("id", conversationId)
      .single<{ memory_summary: string | null; memory_summary_at: string | null }>();
    const watermark = conv?.memory_summary_at ?? null;

    // Messages that fell out of the window since the last refresh.
    let q = supabase
      .from("messages")
      .select("role, content, created_at")
      .eq("conversation_id", conversationId)
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true });
    if (watermark) q = q.gt("created_at", watermark);
    const { data: older } = await q.returns<SummaryMessage[]>();
    if (!older || older.length === 0) return;

    const next = await summarizeConversation(conv?.memory_summary ?? null, older);
    await supabase
      .from("conversations")
      .update({ memory_summary: next, memory_summary_at: older[older.length - 1].created_at })
      .eq("id", conversationId);
  } catch (err) {
    console.error("[memory] refresh failed", err);
  }
}
