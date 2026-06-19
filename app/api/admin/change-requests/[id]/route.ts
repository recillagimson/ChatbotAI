import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireSuperadmin } from "@/lib/admin";
import { draftChangeRequest } from "@/lib/anthropic";
import { MAX_KB_CHARS_PER_CHATBOT } from "@/lib/kb-config";
import { indexEntry } from "@/lib/retrieval";
import type { Chatbot, ChangeRequest, ChangeFinal } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KbEntry = z.object({ title: z.string().min(1).max(200), content: z.string().min(1).max(100_000) });
const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    system_prompt: z.string().max(20_000).optional(),
    kb_entries: z.array(KbEntry).max(50).optional(),
    admin_note: z.string().max(4000).optional(),
  }),
  z.object({ action: z.literal("reject"), admin_note: z.string().max(4000).optional() }),
  z.object({ action: z.literal("regenerate"), adminGuidance: z.string().max(4000).optional() }),
  z.object({ action: z.literal("publish") }),
]);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { id } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const body = parsed.data;

  const supabase = await createClient();
  const { data: crRow } = await supabase.from("change_requests").select("*").eq("id", id).maybeSingle();
  if (!crRow) return NextResponse.json({ error: "Change request not found." }, { status: 404 });
  const cr = crRow as ChangeRequest;

  const nowIso = new Date().toISOString();

  if (body.action === "reject") {
    const { error } = await supabase
      .from("change_requests")
      .update({ status: "rejected", admin_note: body.admin_note ?? null, reviewed_by: admin.id, reviewed_at: nowIso })
      .eq("id", id);
    if (error) return NextResponse.json({ error: "Could not reject." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "approve") {
    const sp = body.system_prompt?.trim();
    const final: ChangeFinal = {
      ...(sp ? { system_prompt: sp } : {}),
      ...(body.kb_entries && body.kb_entries.length
        ? { kb_entries: body.kb_entries.map((e) => ({ title: e.title.trim(), content: e.content.trim() })) }
        : {}),
    };
    const { error } = await supabase
      .from("change_requests")
      .update({ status: "approved", final, admin_note: body.admin_note ?? null, reviewed_by: admin.id, reviewed_at: nowIso })
      .eq("id", id);
    if (error) return NextResponse.json({ error: "Could not approve." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "regenerate") {
    const { data: chatbot } = await supabase
      .from("chatbots")
      .select("id, name, business_description, tone, system_prompt")
      .eq("id", cr.chatbot_id)
      .maybeSingle();
    if (!chatbot) return NextResponse.json({ error: "Chatbot not found." }, { status: 404 });
    try {
      const { data: kbRows } = await supabase.from("knowledge_base").select("title").eq("chatbot_id", cr.chatbot_id);
      const kbTitles = (kbRows ?? []).map((r: { title: string }) => r.title).filter(Boolean);
      const { proposal, model } = await draftChangeRequest({
        chatbot: chatbot as Chatbot,
        kbTitles,
        requestText: cr.request_text,
        adminGuidance: body.adminGuidance,
      });
      const { error } = await supabase
        .from("change_requests")
        .update({ proposed: proposal, model_used: model, draft_error: null })
        .eq("id", id);
      if (error) return NextResponse.json({ error: "Could not save the new draft." }, { status: 500 });
      return NextResponse.json({ ok: true, proposal });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "draft failed";
      await supabase.from("change_requests").update({ draft_error: msg }).eq("id", id);
      return NextResponse.json({ error: "The AI draft failed. Try again." }, { status: 502 });
    }
  }

  // publish
  if (cr.status !== "approved") {
    return NextResponse.json({ error: "Approve the request before publishing." }, { status: 400 });
  }
  const final = (cr.final ?? {}) as ChangeFinal;

  // Need the chatbot OWNER's user_id (for KB rows) + current KB size (for the cap).
  const { data: chatbot } = await supabase
    .from("chatbots").select("id, user_id").eq("id", cr.chatbot_id).maybeSingle();
  if (!chatbot) return NextResponse.json({ error: "Chatbot not found." }, { status: 404 });
  const ownerId = (chatbot as { user_id: string }).user_id;

  const entries = final.kb_entries ?? [];
  if (entries.length) {
    const { data: sizeRows } = await supabase
      .from("knowledge_base").select("content").eq("chatbot_id", cr.chatbot_id);
    const existing = (sizeRows ?? []).reduce((n: number, r: { content: string | null }) => n + (r.content?.length ?? 0), 0);
    const incoming = entries.reduce((n, e) => n + e.content.length, 0);
    if (existing + incoming > MAX_KB_CHARS_PER_CHATBOT) {
      return NextResponse.json({ error: "Knowledge base size limit reached — remove some entries." }, { status: 400 });
    }
  }

  // Apply the prompt (live) — by id; admin RLS overlay authorizes it.
  if (final.system_prompt && final.system_prompt.trim()) {
    const { error } = await supabase
      .from("chatbots").update({ system_prompt: final.system_prompt.trim() }).eq("id", cr.chatbot_id);
    if (error) return NextResponse.json({ error: "Could not update the chatbot prompt." }, { status: 500 });
  }

  // Insert + index KB entries with the OWNER's user_id (never the admin's).
  // Insert as ONE atomic batch so a failure leaves zero new rows (no partial set)
  // — a re-publish then can't create duplicate KB entries. Indexing runs after.
  if (entries.length) {
    const { data: insertedRows, error: insertErr } = await supabase
      .from("knowledge_base")
      .insert(
        entries.map((e) => ({
          chatbot_id: cr.chatbot_id,
          user_id: ownerId,
          title: e.title.trim(),
          content: e.content.trim(),
          source_type: "manual",
        }))
      )
      .select("id, chatbot_id, user_id, content");
    if (insertErr || !insertedRows) {
      return NextResponse.json({ error: "Could not add the knowledge-base entries." }, { status: 500 });
    }
    const svc = createServiceClient();
    for (const inserted of insertedRows as { id: string; chatbot_id: string; user_id: string; content: string }[]) {
      await indexEntry(svc, inserted);
    }
  }

  const { error: stErr } = await supabase
    .from("change_requests").update({ status: "applied", applied_at: nowIso }).eq("id", id);
  if (stErr) return NextResponse.json({ error: "Applied, but failed to update status." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
