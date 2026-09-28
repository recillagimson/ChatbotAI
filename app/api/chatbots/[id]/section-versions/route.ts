import { NextResponse, type NextRequest } from "next/server";
import { resolveChatbotAccess, ownerScope } from "@/lib/chatbot-access";
import { requireSuperadmin } from "@/lib/admin";
import {
  canRestoreSection,
  isSectionColumn,
  versionAuthorLabel,
  VERSION_LIST_LIMIT,
  VERSION_PREVIEW_CHARS,
} from "@/lib/section-versions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/chatbots/[id]/section-versions?section=persona_section
 *
 * The recent history of one prompt section: each earlier text, newest first, as
 * a short preview (the full text is fetched on "View"). Owner or superadmin, via
 * the shared per-bot access check; the table's own RLS repeats the owner check.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await resolveChatbotAccess();
  if (!access.ok) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const section = request.nextUrl.searchParams.get("section");
  if (!isSectionColumn(section)) {
    return NextResponse.json({ error: "Unknown section." }, { status: 400 });
  }

  const { data: bot } = await ownerScope(
    access.db.from("chatbots").select("id, user_id").eq("id", id),
    access
  ).maybeSingle();
  if (!bot) return NextResponse.json({ error: "Chatbot not found." }, { status: 404 });
  const ownerId = (bot as { user_id: string }).user_id;

  const { data, error } = await access.db
    .from("chatbot_section_versions")
    .select("id, content, changed_by, created_at")
    .eq("chatbot_id", id)
    .eq("section", section)
    .order("created_at", { ascending: false })
    .limit(VERSION_LIST_LIMIT);
  if (error) {
    // The history table arrives with a migration; until it is applied, say so
    // instead of failing. (42P01 = undefined table; PGRST205 = PostgREST's
    // "table not in schema cache".)
    if (error.code === "42P01" || error.code === "PGRST205") {
      return NextResponse.json({ error: "History isn't switched on yet." }, { status: 503 });
    }
    console.error("[section-versions] list failed", error);
    return NextResponse.json({ error: "Could not load the history." }, { status: 500 });
  }

  const isAdmin = !!(await requireSuperadmin());
  const rows = (data ?? []) as { id: string; content: string | null; changed_by: string | null; created_at: string }[];
  return NextResponse.json({
    canRestore: canRestoreSection(section, isAdmin),
    versions: rows.map((v) => ({
      id: v.id,
      created_at: v.created_at,
      author: versionAuthorLabel(v.changed_by, { viewerId: access.userId, ownerId }),
      chars: (v.content ?? "").length,
      preview: (v.content ?? "").slice(0, VERSION_PREVIEW_CHARS),
    })),
  });
}
