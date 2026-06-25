// app/api/knowledge-base/[id]/route.ts
// Edit an existing knowledge-base entry (title + content) and re-index it so
// retrieval stays in sync. Used by the KB list's inline editor — uploaded files
// are stored as plain-text entries, so this lets the owner clean them up after
// extraction (fix OCR noise, trim boilerplate, correct facts).
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { indexEntry } from "@/lib/retrieval";
import { MAX_KB_CHARS_PER_CHATBOT } from "@/lib/kb-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(100_000),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request", issues: parsed.error.issues }, { status: 400 });
  }
  const { title, content } = parsed.data;

  // Ownership: load the caller's own entry (RLS also enforces it).
  const { data: entry } = await supabase
    .from("knowledge_base")
    .select("id, chatbot_id, user_id, content")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!entry) return NextResponse.json({ error: "entry not found" }, { status: 404 });

  // Per-chatbot KB-size cap, counting every OTHER entry for this chatbot plus the
  // new content (so growing an edit can't blow the budget).
  const { data: sizeRows } = await supabase
    .from("knowledge_base")
    .select("id, content")
    .eq("chatbot_id", entry.chatbot_id);
  const others = (sizeRows ?? [])
    .filter((r) => r.id !== id)
    .reduce((n, r) => n + (r.content?.length ?? 0), 0);
  if (others + content.length > MAX_KB_CHARS_PER_CHATBOT) {
    return NextResponse.json({ error: "knowledge base size limit reached" }, { status: 400 });
  }

  // Update under RLS. Editing means the owner has curated it → clear needs_review.
  const { error: upErr } = await supabase
    .from("knowledge_base")
    .update({ title, content, needs_review: false })
    .eq("id", id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  // Re-index: indexEntry deletes the old chunks and re-embeds the new content.
  const svc = createServiceClient();
  const idx = await indexEntry(svc, {
    id: entry.id,
    chatbot_id: entry.chatbot_id,
    user_id: entry.user_id,
    content,
  });

  return NextResponse.json({ ok: true, id, indexed: idx.indexed, chunks: idx.chunks });
}
