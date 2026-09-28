import { NextResponse, type NextRequest } from "next/server";
import { resolveChatbotAccess, ownerScope } from "@/lib/chatbot-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/chatbots/[id]/section-versions/[versionId]
 *
 * One earlier version's full text, for "View" in the history panel. The version
 * must belong to this bot, and the caller must own the bot (or be a superadmin).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const { id, versionId } = await params;
  const access = await resolveChatbotAccess();
  if (!access.ok) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data: bot } = await ownerScope(
    access.db.from("chatbots").select("id").eq("id", id),
    access
  ).maybeSingle();
  if (!bot) return NextResponse.json({ error: "Chatbot not found." }, { status: 404 });

  const { data: v } = await access.db
    .from("chatbot_section_versions")
    .select("id, section, content")
    .eq("id", versionId)
    .eq("chatbot_id", id)
    .maybeSingle();
  if (!v) return NextResponse.json({ error: "Version not found." }, { status: 404 });

  const row = v as { id: string; section: string; content: string | null };
  return NextResponse.json({ id: row.id, section: row.section, content: row.content ?? "" });
}
