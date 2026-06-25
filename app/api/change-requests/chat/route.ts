import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { chatTurn, type ChatTurnMessage } from "@/lib/openai-changes";
import { downloadAsBase64, downloadAsBuffer, CLAUDE_IMAGE_TYPES } from "@/lib/storage";
import { extractTextFromFile, MAX_DOC_CHARS } from "@/lib/document-parser";
import type { Chatbot, ChangeRequest, TranscriptMessage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  chatbot_id: z.string().uuid(),
  change_request_id: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
  images: z.array(z.object({ path: z.string(), name: z.string() })).max(5).optional(),
  files: z
    .array(z.object({ path: z.string(), name: z.string(), type: z.string() }))
    .max(5)
    .optional(),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid message." }, { status: 400 });
  const { chatbot_id, change_request_id, message, images, files } = parsed.data;

  // Defense-in-depth: every attachment path must be under the caller's own folder.
  if (
    images?.some((im) => !im.path.startsWith(user.id + "/")) ||
    files?.some((f) => !f.path.startsWith(user.id + "/"))
  ) {
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
    ...(files && files.length ? { files } : {}),
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

  // Build the model transcript. The assistant reads the bot's FULL current
  // knowledge (title + content), so it proposes changes grounded in what exists.
  const kbRows = (await supabase.from("knowledge_base").select("title, content").eq("chatbot_id", chatbot_id)).data;
  const kbEntries = (kbRows ?? [])
    .map((r: { title: string; content: string }) => ({ title: r.title, content: r.content }))
    .filter((e) => e.title && e.content);

  const modelMessages: ChatTurnMessage[] = [];
  for (const m of transcript) {
    if (m.role !== "user") {
      modelMessages.push({ role: m.role, content: m.content });
      continue;
    }

    // Resolve IMAGE attachments to base64 (sent to the model as vision).
    const resolved: { base64: string; mediaType: string }[] = [];
    for (const im of m.images ?? []) {
      const got = await downloadAsBase64(supabase, im.path);
      if (got && (CLAUDE_IMAGE_TYPES as readonly string[]).includes(got.mediaType)) resolved.push(got);
    }

    // Resolve DOCUMENT attachments to text and fold them into the message so the
    // assistant reads the file content. Extraction failures are noted, not fatal.
    let content = m.content;
    for (const f of m.files ?? []) {
      let block: string;
      try {
        const got = await downloadAsBuffer(supabase, f.path);
        if (!got) throw new Error("file not found");
        const text = (await extractTextFromFile({ buffer: got.buffer, name: f.name })).trim();
        block = text
          ? text.slice(0, MAX_DOC_CHARS) + (text.length > MAX_DOC_CHARS ? "\n…(truncated)" : "")
          : "(no readable text found in this file)";
      } catch {
        block = "(could not read this file — it may be scanned, encrypted, or an unsupported format)";
      }
      content += `\n\n--- Attached knowledge file: ${f.name} ---\n${block}`;
    }

    modelMessages.push({ role: "user", content, ...(resolved.length ? { images: resolved } : {}) });
  }

  // Run the scoped assistant turn.
  let assistantText: string;
  let proposal;
  let model: string;
  try {
    const out = await chatTurn({ chatbot: chatbot as Chatbot, kbEntries, messages: modelMessages });
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
