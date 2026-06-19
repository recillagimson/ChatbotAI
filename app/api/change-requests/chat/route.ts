import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { chatTurn, type ChatTurnMessage } from "@/lib/anthropic";
import { downloadAsBase64, CLAUDE_IMAGE_TYPES } from "@/lib/storage";
import type { Chatbot, ChangeRequest, TranscriptMessage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  chatbot_id: z.string().uuid(),
  change_request_id: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
  images: z.array(z.object({ path: z.string(), name: z.string() })).max(5).optional(),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid message." }, { status: 400 });
  const { chatbot_id, change_request_id, message, images } = parsed.data;

  // Defense-in-depth: every image path must be under the caller's own folder.
  if (images?.some((im) => !im.path.startsWith(user.id + "/"))) {
    return NextResponse.json({ error: "Invalid attachment." }, { status: 400 });
  }

  const supabase = await createClient();

  // Ownership + SAFE chatbot context (NEVER select *).
  const { data: chatbot } = await supabase
    .from("chatbots")
    .select("id, name, business_description, tone, system_prompt")
    .eq("id", chatbot_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!chatbot) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const nowIso = new Date().toISOString();
  const userMsg: TranscriptMessage = {
    role: "user",
    content: message,
    ...(images && images.length ? { images } : {}),
    created_at: nowIso,
  };

  // Resolve or create the draft, persisting the user message first (so it's never lost).
  let crId: string;
  let transcript: TranscriptMessage[];
  if (change_request_id) {
    const { data: existing } = await supabase
      .from("change_requests")
      .select("id, status, transcript")
      .eq("id", change_request_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!existing) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    const row = existing as Pick<ChangeRequest, "id" | "status" | "transcript">;
    if (row.status !== "draft") {
      return NextResponse.json({ error: "This request was already submitted." }, { status: 400 });
    }
    crId = row.id;
    transcript = [...(row.transcript ?? []), userMsg];
    const { error } = await supabase.from("change_requests").update({ transcript }).eq("id", crId);
    if (error) return NextResponse.json({ error: "Could not save your message." }, { status: 500 });
  } else {
    transcript = [userMsg];
    const { data: inserted, error } = await supabase
      .from("change_requests")
      .insert({
        chatbot_id,
        user_id: user.id,
        request_text: message,
        status: "draft",
        transcript,
        title: message.slice(0, 80),
      })
      .select("id")
      .single();
    if (error || !inserted) return NextResponse.json({ error: "Could not start the request." }, { status: 500 });
    crId = inserted.id;
  }

  // Build the model transcript: resolve each user message's IMAGE attachments to base64.
  const kbRows = (await supabase.from("knowledge_base").select("title").eq("chatbot_id", chatbot_id)).data;
  const kbTitles = (kbRows ?? []).map((r: { title: string }) => r.title).filter(Boolean);

  const modelMessages: ChatTurnMessage[] = [];
  for (const m of transcript) {
    if (m.role === "user" && m.images?.length) {
      const resolved: { base64: string; mediaType: string }[] = [];
      for (const im of m.images) {
        const got = await downloadAsBase64(supabase, im.path);
        if (got && (CLAUDE_IMAGE_TYPES as readonly string[]).includes(got.mediaType)) resolved.push(got);
      }
      modelMessages.push({ role: "user", content: m.content, ...(resolved.length ? { images: resolved } : {}) });
    } else {
      modelMessages.push({ role: m.role, content: m.content });
    }
  }

  // Run the scoped assistant turn.
  let assistantText: string;
  let proposal;
  let model: string;
  try {
    const out = await chatTurn({ chatbot: chatbot as Chatbot, kbTitles, messages: modelMessages });
    assistantText = out.assistantText;
    proposal = out.proposal;
    model = out.model;
  } catch (err) {
    console.error("[change-requests/chat] chatTurn failed", err);
    // The user message is already saved; let the client retry with a follow-up.
    return NextResponse.json({ id: crId, error: "The assistant is unavailable right now. Please try again." }, { status: 502 });
  }

  const assistantMsg: TranscriptMessage = { role: "assistant", content: assistantText, created_at: new Date().toISOString() };
  const finalTranscript = [...transcript, assistantMsg];
  const update: Record<string, unknown> = { transcript: finalTranscript };
  if (proposal) { update.proposed = proposal; update.model_used = model; }
  const { error: upErr } = await supabase.from("change_requests").update(update).eq("id", crId);
  if (upErr) return NextResponse.json({ error: "Could not save the reply." }, { status: 500 });

  return NextResponse.json({ id: crId, transcript: finalTranscript, proposal: proposal ?? null });
}
