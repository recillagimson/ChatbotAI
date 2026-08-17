import { NextResponse, type NextRequest } from "next/server";
import { createClient, getCurrentUser, createServiceClient } from "@/lib/supabase/server";
import { generateFollowupText } from "@/lib/anthropic";
import { buildKbBlock } from "@/lib/retrieval";
import type { Chatbot } from "@/lib/types";

export const runtime = "nodejs";

const MAX_LEN = 1000; // ManyChat per-message ceiling (mirrors the /reply route)

/**
 * Draft (do NOT send) an on-brand AI FOLLOW-UP nudge for a conversation the lead
 * has gone quiet on, so the owner can re-engage them by hand from the Follow-ups
 * queue. Uses `generateFollowupText` - the SAME engine that writes the bot's live
 * drip follow-ups - so the draft is a short re-engagement message in the chatbot's
 * own persona, grounded in the KB, the stored transcript, the rolling memory
 * summary and the durable known-facts (it references where the conversation left
 * off and does NOT just repeat the last reply). It delivers nothing and writes no
 * conversation/message rows - the owner reviews, edits, and sends manually (the
 * queue's "Open in ManyChat"/native buttons).
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
    .select("id, chatbot_id, memory_summary, known_facts")
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
    .map((m) => ({
      role: m.role as string,
      content: (m.content ?? "").trim(),
      created_at: m.created_at as string,
    }))
    .filter((m) => m.content);

  if (all.length === 0) {
    return NextResponse.json(
      { error: "No conversation yet to follow up on." },
      { status: 422 }
    );
  }

  // The WHOLE transcript is context for the follow-up (a re-engagement nudge picks
  // up where the conversation left off - unlike a reply, it isn't answering one
  // message). `human_agent` = the owner's own past manual replies are OUR side, so
  // map them to `assistant`; generateReply only distinguishes assistant vs.
  // everything-else, and mapping them to `user` would misattribute them to the lead.
  const history = all.map((m) => ({
    role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
    content: m.content,
  }));

  // The lead's last inbound drives both the KB retrieval query (stay on-topic) and
  // the silence clock the follow-up references. Falls back to the last message of
  // any kind on a welcome-only thread the lead hasn't answered yet.
  const lastLead = [...all].reverse().find((m) => m.role === "user") ?? all[all.length - 1];
  const hoursSilent = Math.max(
    1,
    (Date.now() - new Date(lastLead.created_at).getTime()) / 3_600_000
  );

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
      userMessage: lastLead.content,
    });
    // generateFollowupText writes a short re-engagement nudge in the bot's persona
    // from the conversation so far (buildFollowupInstruction) - the same engine as
    // the live drip. instruction:null = let the model decide from the transcript.
    const result = await generateFollowupText({
      chatbot,
      kbBlock: kb.block,
      history,
      memorySummary: conversation.memory_summary ?? null,
      knownFacts: conversation.known_facts ?? null,
      instruction: null,
      hoursSilent,
    });

    // Defensive: strip any stray [[...]] directives, collapse blank runs, cap at
    // the ManyChat per-message ceiling. The owner edits before sending.
    const draft = (result?.text ?? "")
      .replace(/\[\[[^\]]*\]\]/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, MAX_LEN)
      .trim();

    if (!draft) {
      return NextResponse.json(
        { error: "Couldn't draft a follow-up - try again." },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, draft });
  } catch (err) {
    console.error("[suggest-reply] follow-up draft failed", err);
    return NextResponse.json(
      { error: "Couldn't draft a follow-up - try again." },
      { status: 502 }
    );
  }
}
