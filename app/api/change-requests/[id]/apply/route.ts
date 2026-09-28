import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient, getCurrentUser } from "@/lib/supabase/server";
import { SECTION_BY_CATEGORY } from "@/lib/change-categories";
import { rebaseOnLive } from "@/lib/section-edits";
import type { ChangeProposal, ChangeRequest } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/change-requests/[id]/apply
 *
 * Client-side instant apply for PERSONALITY changes only. Personality edits are
 * voice/tone (low risk) and the owner could make the exact same write directly
 * on the prompts page, so they don't need admin approval. Offers/Rebuttals/Other
 * still go through submit -> admin -> publish.
 *
 * Auth: the owner of the chatbot. The persona write uses the owner's own RLS
 * client (chatbots "own chatbots" policy already allows it). Flipping the
 * change_request to "applied" uses the service client ONLY because change_requests
 * UPDATE is admin-only by RLS - and ONLY after the owner is fully authorized and
 * scoped by user_id. This is not privilege escalation: nothing here a logged-in
 * owner can't already do to their own chatbot.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  const supabase = await createClient();

  // Load the request (RLS: owner can read their own rows).
  const { data: cr } = await supabase
    .from("change_requests")
    .select("id, status, category, chatbot_id, proposed")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!cr) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  const row = cr as Pick<ChangeRequest, "id" | "status" | "category" | "chatbot_id" | "proposed">;

  if (row.category !== "personality") {
    return NextResponse.json(
      { error: "Only personality changes can be applied directly. Submit this to the team for review." },
      { status: 403 }
    );
  }
  if (row.status !== "draft") {
    return NextResponse.json({ error: "This request was already submitted or applied." }, { status: 400 });
  }

  const proposal = row.proposed as ChangeProposal | null;
  const drafted = proposal?.section_content?.trim();
  if (!proposal || !drafted) {
    return NextResponse.json({ error: "There's no proposed change to apply yet." }, { status: 400 });
  }

  // 1. Write the persona section to the live bot via the owner's own RLS client.
  // Read the live text, check the proposal against it, then compare-and-set on
  // updated_at so a write landing in between is never overwritten. Any update to
  // the bot row moves updated_at (even an unrelated setting), so one miss is
  // retried from a fresh read before giving up.
  let applied = false;
  for (let attempt = 0; attempt < 2 && !applied; attempt++) {
    // Confirm the owner still owns the target chatbot (defense in depth), and read
    // the LIVE personality text + its updated_at for the checks below.
    const { data: bot } = await supabase
      .from("chatbots")
      .select("id, persona_section, updated_at")
      .eq("id", row.chatbot_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!bot) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    const liveRow = bot as { id: string; persona_section: string | null; updated_at: string };

    // The proposal was drafted against a specific version of the text. If the text
    // changed since (an edit on the Prompt tab, another request, a restore), re-apply
    // the proposal's targeted edits on top of it, or stop - never overwrite it.
    const next = rebaseOnLive(liveRow.persona_section ?? "", {
      base_hash: proposal.base_hash,
      edits: proposal.edits,
      append: proposal.append,
      text: drafted,
    });
    if (!next.ok) {
      return NextResponse.json(
        { error: `${next.reason} Ask the assistant for the change again.` },
        { status: 409 }
      );
    }

    const { data: written, error: botErr } = await supabase
      .from("chatbots")
      .update({ [SECTION_BY_CATEGORY.personality]: next.text })
      .eq("id", row.chatbot_id)
      .eq("user_id", user.id)
      .eq("updated_at", liveRow.updated_at)
      .select("id");
    if (botErr) {
      console.error("[change-requests/apply] chatbot update failed", botErr);
      return NextResponse.json({ error: "Could not apply the change. Please try again." }, { status: 500 });
    }
    applied = !!written && written.length > 0;
  }
  if (!applied) {
    return NextResponse.json(
      { error: "Your bot was updated at the same moment. Please click Apply again." },
      { status: 409 }
    );
  }

  // 2. Stamp the request as applied. Service client (change_requests UPDATE is
  // admin-only by RLS), scoped to this owner's row, after full authorization.
  const svc = createServiceClient();
  const { error: crErr } = await svc
    .from("change_requests")
    .update({ status: "applied", applied_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (crErr) {
    // The persona is already live; surface a soft error so the client can refresh.
    console.error("[change-requests/apply] status stamp failed", crErr);
    return NextResponse.json(
      { ok: true, warning: "Applied to your bot, but the request status didn't update. Refresh to see it." },
      { status: 200 }
    );
  }

  return NextResponse.json({ ok: true });
}
