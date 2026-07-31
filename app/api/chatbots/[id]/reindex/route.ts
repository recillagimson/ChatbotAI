// app/api/chatbots/[id]/reindex/route.ts
// "Retrain bot": re-index every knowledge-base entry for a chatbot (rebuild the
// embeddings so retrieval matches the current text) and clear the short-lived
// reply/dedup caches. The DM reply already reads KB content live, so this mainly
// refreshes the vector index + makes an immediate re-ask get a fresh answer.
import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient, getCurrentUser } from "@/lib/supabase/server";
import { indexEntry } from "@/lib/retrieval";
import { clearReplyCaches } from "@/lib/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  // Impersonation-aware: under admin "view as", getCurrentUser() is the CLIENT, so
  // ownership + the KB fetch scope to the client's bot (the is_superadmin() overlays
  // let the admin operate it). auth.getUser() would never match a client-owned bot.
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Ownership check (RLS also enforces it on the reads below).
  const { data: chatbot } = await supabase
    .from("chatbots")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!chatbot) return NextResponse.json({ error: "chatbot not found" }, { status: 404 });

  const { data: entries } = await supabase
    .from("knowledge_base")
    .select("id, chatbot_id, user_id, content")
    .eq("chatbot_id", id);

  // Re-index with the service client (indexEntry writes kb_chunks, RLS-exempt).
  // indexEntry is idempotent (deletes old chunks, re-embeds). A no-op when
  // embeddings are disabled (no OPENAI_API_KEY) - the DM path reads KB live anyway.
  const svc = createServiceClient();
  let indexed = 0;
  let chunks = 0;
  for (const entry of entries ?? []) {
    const r = await indexEntry(svc, entry);
    if (r.indexed) indexed += 1;
    chunks += r.chunks;
  }

  // Best-effort: clear the chatbot's short-lived reply/dedup caches (fail-open).
  const cleared = await clearReplyCaches(id).catch(() => 0);

  return NextResponse.json({
    ok: true,
    entries: entries?.length ?? 0,
    indexed,
    chunks,
    cleared,
  });
}
