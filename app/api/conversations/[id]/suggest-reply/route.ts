import { NextResponse, type NextRequest } from "next/server";
import { createClient, getCurrentUser, createServiceClient } from "@/lib/supabase/server";
import { generateReply } from "@/lib/anthropic";
import { buildKbBlock } from "@/lib/retrieval";
import { renderTrainedResponses } from "@/lib/training";
import type { Chatbot } from "@/lib/types";

export const runtime = "nodejs";

const MAX_LEN = 1000; // ManyChat per-message ceiling (mirrors the /reply route)

/**
 * Draft (do NOT send) an on-brand AI reply for a conversation, so the owner can
 * take over a thread the bot went silent on and keep it moving. Runs the same
 * reply engine the live bot uses (persona, KB, known facts, memory summary,
 * scheduled start, trained responses) over the stored transcript and returns the
 * text for the composer to prefill. It delivers nothing and writes no
 * conversation/message rows - the owner reviews, edits, and sends via POST /reply.
 * (buildKbBlock may refresh the chatbot's retrieval_active flag, exactly as the
 * live path does - idempotent KB-mode housekeeping, not conversation state.)
 *
 * Auth = the cookie session + RLS, scoped to the caller's own conversation (with
 * an explicit user_id check), so one tenant can never draft into another's thread.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  // RLS scopes this to the caller's conversations; the user_id filter is
  // belt-and-suspenders and gives a clean 404 instead of an RLS empty.
  const { data: conversation, error } = await supabase
    .from("conversations")
    .select("id, chatbot_id, memory_summary, known_facts, start_on, start_note")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (error || !conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  // Full chatbot row: persona / system_prompt / training_pairs / retrieval_active
  // all feed the prompt assembly (RLS lets the owner read their own chatbot).
  const { data: chatbotRow } = await supabase
    .from("chatbots")
    .select("*")
    .eq("id", conversation.chatbot_id)
    .single();
  if (!chatbotRow) {
    return NextResponse.json({ error: "Chatbot not found." }, { status: 404 });
  }
  const chatbot = chatbotRow as Chatbot;

  const { data: messages } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  const all = (messages ?? [])
    .map((m) => ({ role: m.role as string, content: (m.content ?? "").trim() }))
    .filter((m) => m.content);

  // We're drafting a reply TO the lead's most recent turn.
  let lastLeadIdx = -1;
  for (let i = all.length - 1; i >= 0; i--) {
    if (all[i].role === "user") {
      lastLeadIdx = i;
      break;
    }
  }
  if (lastLeadIdx < 0) {
    return NextResponse.json(
      { error: "No message from this person to reply to yet." },
      { status: 422 }
    );
  }
  const userMessage = all[lastLeadIdx].content;
  // Everything else is context, in chronological order - exclude ONLY the row
  // we're drafting a reply to. (Truncating the tail would hide our OWN most recent
  // reply - e.g. a subscribed thread whose last row is the bot's confirmation - and
  // the draft would then repeat or contradict it.) `human_agent` = the owner's past
  // manual replies are OUR side, so map them to `assistant`; generateReply only
  // distinguishes assistant vs. everything-else, and mapping them to `user` would
  // misattribute the owner's words to the lead.
  const rest = [...all.slice(0, lastLeadIdx), ...all.slice(lastLeadIdx + 1)];
  const history = rest.map((m) => ({
    role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
    content: m.content,
  }));

  try {
    // KB retrieval needs the SERVICE-ROLE client: the vector-search RPC
    // (match_kb_chunks) is granted only to service_role, so the session client
    // silently degrades to truncated full-context for retrieval-mode chatbots.
    // Ownership was already enforced above, so scoping to this chatbot is safe.
    // Mirrors the live webhook, which also passes a service client here.
    const kb = await buildKbBlock({
      supabase: createServiceClient(),
      chatbot,
      history,
      userMessage,
    });
    const { text } = await generateReply({
      chatbot,
      kbBlock: kb.block,
      history,
      userMessage,
      memorySummary: conversation.memory_summary ?? null,
      // No media catalog on purpose: a manual draft is text-only (delivered via
      // /reply), so the model must not emit [[SEND_ASSET]] directives.
      scheduledStart:
        conversation.start_note || conversation.start_on
          ? { note: conversation.start_note ?? null, on: conversation.start_on ?? null }
          : null,
      trainedResponses: renderTrainedResponses(chatbot.training_pairs),
      knownFacts: conversation.known_facts ?? null,
    });

    // Defensive: strip any stray [[...]] directives, collapse blank runs, cap at
    // the ManyChat per-message ceiling. The owner edits before sending.
    const draft = (text ?? "")
      .replace(/\[\[[^\]]*\]\]/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, MAX_LEN)
      .trim();

    if (!draft) {
      return NextResponse.json(
        { error: "Couldn't draft a reply - try again." },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, draft });
  } catch (err) {
    console.error("[suggest-reply] generate failed", err);
    return NextResponse.json(
      { error: "Couldn't draft a reply - try again." },
      { status: 502 }
    );
  }
}
