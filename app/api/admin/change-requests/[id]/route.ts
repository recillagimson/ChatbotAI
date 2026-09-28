import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireSuperadmin } from "@/lib/admin";
import { draftChangeRequest } from "@/lib/openai-changes";
import { sectionColumnFor } from "@/lib/change-categories";
import { buildChangeFinal, planPublish, type LiveSections } from "@/lib/change-final";
import { MAX_SECTION_CHARS } from "@/lib/section-edits";
import { MAX_KB_CHARS_PER_CHATBOT } from "@/lib/kb-config";
import { indexEntry } from "@/lib/retrieval";
import type { Chatbot, ChangeRequest, ChangeFinal } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KbEntry = z.object({ title: z.string().min(1).max(200), content: z.string().min(1).max(100_000) });

// What Approve carries. Sections are capped at MAX_SECTION_CHARS (200k), not the
// old 20k: live sections run to ~100k characters, and the old cap made every
// Offers/Rebuttals request on those bots impossible to approve.
const ApproveFields = {
  section_content: z.string().max(MAX_SECTION_CHARS).optional(), // single-section categories
  sections: z                                                      // "overall": each affected section
    .array(
      z.object({
        section: z.enum(["persona_section", "offers_section", "rebuttals_section"]),
        section_content: z.string().max(MAX_SECTION_CHARS),
      })
    )
    .max(3)
    .optional(),
  system_prompt: z.string().max(20_000).optional(),   // LEGACY: old requests still publish into system_prompt
  kb_entries: z.array(KbEntry).max(50).optional(),
  admin_note: z.string().max(4000).optional(),
};

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), ...ApproveFields }),
  // One step for the common case: approve exactly what's on screen and publish it.
  z.object({ action: z.literal("approve_publish"), ...ApproveFields }),
  z.object({ action: z.literal("reject"), admin_note: z.string().max(4000).optional() }),
  z.object({ action: z.literal("regenerate"), adminGuidance: z.string().max(4000).optional() }),
  z.object({ action: z.literal("publish") }),
]);

type Db = Awaited<ReturnType<typeof createClient>>;

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

  if (body.action === "approve" || body.action === "approve_publish") {
    // Carries the proposal's edits + base fingerprint (see lib/change-final.ts), so
    // Publish can re-check the text against the live section.
    const final = buildChangeFinal({
      category: cr.category,
      proposed: cr.proposed,
      section_content: body.section_content,
      sections: body.sections,
      system_prompt: body.system_prompt,
      kb_entries: body.kb_entries,
    });
    const { error } = await supabase
      .from("change_requests")
      .update({ status: "approved", final, admin_note: body.admin_note ?? null, reviewed_by: admin.id, reviewed_at: nowIso })
      .eq("id", id);
    if (error) return NextResponse.json({ error: "Could not approve." }, { status: 500 });
    if (body.action === "approve") return NextResponse.json({ ok: true });
    // Approved above; if the publish below is refused, the request stays approved
    // (not live) and the reason comes back to the reviewer.
    return publish(supabase, cr, final, id, nowIso);
  }

  if (body.action === "regenerate") {
    const { data: chatbot } = await supabase
      .from("chatbots")
      .select(
        "id, name, business_description, tone, system_prompt, persona_section, offers_section, rebuttals_section"
      )
      .eq("id", cr.chatbot_id)
      .maybeSingle();
    if (!chatbot) return NextResponse.json({ error: "Chatbot not found." }, { status: 404 });
    try {
      const { data: kbRows } = await supabase.from("knowledge_base").select("title, content").eq("chatbot_id", cr.chatbot_id);
      const kbEntries = (kbRows ?? [])
        .map((r: { title: string; content: string }) => ({ title: r.title, content: r.content }))
        .filter((e) => e.title && e.content);
      const regenCol = sectionColumnFor(cr.category);
      const currentSection = regenCol ? ((chatbot as Chatbot)[regenCol] ?? "") : "";
      // "overall" isn't scoped to one section - pass the live text of all three.
      const sections =
        cr.category === "overall"
          ? {
              persona_section: (chatbot as Chatbot).persona_section ?? "",
              offers_section: (chatbot as Chatbot).offers_section ?? "",
              rebuttals_section: (chatbot as Chatbot).rebuttals_section ?? "",
            }
          : undefined;
      const { proposal, model } = await draftChangeRequest({
        chatbot: chatbot as Chatbot,
        kbEntries,
        requestText: cr.request_text,
        adminGuidance: body.adminGuidance,
        category: cr.category,
        currentSection,
        sections,
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
  return publish(supabase, cr, (cr.final ?? {}) as ChangeFinal, id, nowIso);
}

/**
 * Make an approved change live. Re-checks every section against its LIVE text
 * (planPublish): unchanged since drafting -> the approved text; changed -> the
 * edits re-applied on top; otherwise 409 with the reason, and nothing is written.
 * The section write is a compare-and-set on chatbots.updated_at, so a write that
 * lands between the read and this update is never overwritten.
 */
async function publish(
  supabase: Db,
  cr: ChangeRequest,
  final: ChangeFinal,
  id: string,
  nowIso: string
): Promise<NextResponse> {
  const entries = final.kb_entries ?? [];
  if (entries.length) {
    const { data: sizeRows } = await supabase
      .from("knowledge_base").select("content").eq("chatbot_id", cr.chatbot_id);
    const existing = (sizeRows ?? []).reduce((n: number, r: { content: string | null }) => n + (r.content?.length ?? 0), 0);
    const incoming = entries.reduce((n, e) => n + e.content.length, 0);
    if (existing + incoming > MAX_KB_CHARS_PER_CHATBOT) {
      return NextResponse.json({ error: "Knowledge base size limit reached - remove some entries." }, { status: 400 });
    }
  }

  // Read the live sections, plan against them, then write - a compare-and-set on
  // updated_at. Any update to the bot row moves updated_at (even an unrelated
  // setting), so one miss is retried from a fresh read before giving up.
  let ownerId = "";
  let plan: Extract<ReturnType<typeof planPublish>, { ok: true }> | null = null;
  for (let attempt = 0; attempt < 2 && !plan; attempt++) {
    // The chatbot OWNER's user_id (for KB rows), the live sections and updated_at.
    const { data: chatbot } = await supabase
      .from("chatbots")
      .select("id, user_id, updated_at, persona_section, offers_section, rebuttals_section, system_prompt")
      .eq("id", cr.chatbot_id)
      .maybeSingle();
    if (!chatbot) return NextResponse.json({ error: "Chatbot not found." }, { status: 404 });
    const bot = chatbot as LiveSections & { id: string; user_id: string; updated_at: string };
    ownerId = bot.user_id;

    const attemptPlan = planPublish(cr.category, final, bot);
    if (!attemptPlan.ok) {
      return NextResponse.json(
        {
          error: `Not published: ${attemptPlan.conflicts.join(" ")} Use Regenerate to draft it again from the current text.`,
        },
        { status: 409 }
      );
    }

    // Apply the prompt (live) - by id; admin RLS overlay authorizes it. One update
    // for every column, so an "overall" request publishes atomically.
    if (!Object.keys(attemptPlan.patch).length) {
      plan = attemptPlan;
      break;
    }
    const { data: written, error } = await supabase
      .from("chatbots")
      .update(attemptPlan.patch)
      .eq("id", cr.chatbot_id)
      .eq("updated_at", bot.updated_at)
      .select("id");
    if (error) return NextResponse.json({ error: "Could not update the chatbot." }, { status: 500 });
    if (written && written.length > 0) plan = attemptPlan;
  }
  if (!plan) {
    return NextResponse.json(
      { error: "The bot was updated at the same moment. Publish again to re-check against the new text." },
      { status: 409 }
    );
  }

  // Insert + index KB entries with the OWNER's user_id (never the admin's).
  // Insert as ONE atomic batch so a failure leaves zero new rows (no partial set)
  // - a re-publish then can't create duplicate KB entries. Indexing runs after.
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
      // The prompt change may already be live at this point. Publishing again is
      // safe: sections that already hold the approved text are left as they are,
      // and the entries insert as one batch.
      return NextResponse.json(
        {
          error: Object.keys(plan.patch).length
            ? "The prompt change is live, but adding the knowledge entries failed. Click Publish again to add them; it won't repeat the prompt change."
            : "Could not add the knowledge-base entries.",
        },
        { status: 500 }
      );
    }
    const svc = createServiceClient();
    for (const inserted of insertedRows as { id: string; chatbot_id: string; user_id: string; content: string }[]) {
      await indexEntry(svc, inserted);
    }
  }

  // Record exactly what went live (after any re-apply), so the Applied view shows
  // the real text rather than the pre-merge approval.
  const liveFinal: ChangeFinal = plan.rebased.length
    ? {
        ...final,
        ...(final.section && plan.patch[final.section] ? { section_content: plan.patch[final.section] } : {}),
        ...(final.sections
          ? {
              sections: final.sections.map((s) =>
                plan.patch[s.section] ? { ...s, section_content: plan.patch[s.section] } : s
              ),
            }
          : {}),
      }
    : final;

  const { error: stErr } = await supabase
    .from("change_requests")
    .update({ status: "applied", applied_at: nowIso, final: liveFinal })
    .eq("id", id);
  if (stErr) return NextResponse.json({ error: "Applied, but failed to update status." }, { status: 500 });

  return NextResponse.json({ ok: true, rebased: plan.rebased });
}
