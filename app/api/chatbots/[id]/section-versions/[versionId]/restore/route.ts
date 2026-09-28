import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveChatbotAccess, ownerScope } from "@/lib/chatbot-access";
import { requireSuperadmin } from "@/lib/admin";
import { canRestoreSection, isSectionColumn } from "@/lib/section-versions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/chatbots/[id]/section-versions/[versionId]/restore
 *
 * Put an earlier version of a prompt section back. The history trigger records
 * the text being replaced, so a restore is itself undoable. Personality can be
 * restored by the owner; Offers and Rebuttals only by the team, like editing them.
 *
 * The write uses the caller's own session (not the service client), so the
 * history row names who restored it; the superadmin RLS overlay authorizes an
 * admin. It is a compare-and-set on updated_at, so a change landing between the
 * read and the write is never overwritten.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const { id, versionId } = await params;
  const access = await resolveChatbotAccess();
  if (!access.ok) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data: bot } = await ownerScope(
    access.db.from("chatbots").select("id, updated_at").eq("id", id),
    access
  ).maybeSingle();
  if (!bot) return NextResponse.json({ error: "Chatbot not found." }, { status: 404 });
  const updatedAt = (bot as { updated_at: string }).updated_at;

  const { data: v } = await access.db
    .from("chatbot_section_versions")
    .select("id, section, content")
    .eq("id", versionId)
    .eq("chatbot_id", id)
    .maybeSingle();
  if (!v) return NextResponse.json({ error: "Version not found." }, { status: 404 });
  const version = v as { id: string; section: string; content: string | null };
  if (!isSectionColumn(version.section)) {
    return NextResponse.json({ error: "Unknown section." }, { status: 400 });
  }

  // Keyed off the REAL user, like the Prompt tab's own edit permission, so an
  // admin viewing as a client can restore what they can edit there.
  const isAdmin = !!(await requireSuperadmin());
  if (!canRestoreSection(version.section, isAdmin)) {
    return NextResponse.json(
      { error: "Offers and Rebuttals are restored by the SpeedSettr team. Send a change request instead." },
      { status: 403 }
    );
  }

  const session = await createClient();
  const { data: written, error } = await ownerScope(
    session
      .from("chatbots")
      .update({ [version.section]: version.content })
      .eq("id", id)
      .eq("updated_at", updatedAt),
    access
  ).select("id");
  if (error) {
    console.error("[section-versions] restore failed", error);
    return NextResponse.json({ error: "Could not restore this version." }, { status: 500 });
  }
  if (!written || written.length === 0) {
    return NextResponse.json(
      { error: "The bot changed at the same moment. Reload and try again." },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true, section: version.section, content: version.content ?? "" });
}
