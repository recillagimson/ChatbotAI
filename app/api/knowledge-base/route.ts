// app/api/knowledge-base/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { resolveKbWriteByChatbot } from "@/lib/kb-access-server";
import { indexEntry } from "@/lib/retrieval";
import { MAX_KB_CHARS_PER_CHATBOT } from "@/lib/kb-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  chatbot_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(100_000),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request", issues: parsed.error.issues }, { status: 400 });
  }
  const { chatbot_id, title, content } = parsed.data;

  // Authorize + resolve whose KB this is (self/impersonation vs superadmin-on-behalf).
  const access = await resolveKbWriteByChatbot(chatbot_id);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.status === 401 ? "unauthorized" : "chatbot not found" },
      { status: access.status }
    );
  }
  const db = access.admin ? createServiceClient() : supabase;
  const ownerId = access.ownerId;

  // Per-chatbot KB-size cap.
  const { data: sizeRows } = await db
    .from("knowledge_base")
    .select("content")
    .eq("chatbot_id", chatbot_id);
  const existing = (sizeRows ?? []).reduce((n, r) => n + (r.content?.length ?? 0), 0);
  if (existing + content.length > MAX_KB_CHARS_PER_CHATBOT) {
    return NextResponse.json({ error: "knowledge base size limit reached" }, { status: 400 });
  }

  // Insert with the resolved owner id (never from the request body).
  const { data: inserted, error } = await db
    .from("knowledge_base")
    .insert({ chatbot_id, user_id: ownerId, title, content, source_type: "manual" })
    .select("id, chatbot_id, user_id, content")
    .single();
  if (error || !inserted) {
    return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 400 });
  }

  // Index with the service client (RLS-exempt; ids come from the inserted row).
  const svc = createServiceClient();
  const idx = await indexEntry(svc, inserted);

  return NextResponse.json({ ok: true, id: inserted.id, indexed: idx.indexed, chunks: idx.chunks });
}
