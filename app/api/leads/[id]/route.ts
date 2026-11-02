import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient, getCurrentUser, getRealUser } from "@/lib/supabase/server";
import {
  LEAD_STATUSES,
  MAX_REMARK_CHARS,
  cleanRemark,
  leadStatusOf,
  statusChangeRemark,
} from "@/lib/lead-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.union([
  z.object({ status: z.enum(LEAD_STATUSES) }),
  z.object({ remark: z.string().max(MAX_REMARK_CHARS + 200) }),
]);

/**
 * POST /api/leads/[id] - update one lead on the Lead contacts page.
 *   { status }  : set conversations.lead_status and log "Status: A → B"
 *   { remark }  : add an update to the lead's remarks log
 * [id] is the conversation id. Scoped to the effective user (getCurrentUser, so an
 * admin under "View as client" acts on that client's lead) through the RLS client;
 * the remark's author is the REAL signed-in person.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const author = await getRealUser();
  if (!user || !author) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const supabase = await createClient();
  const { data: lead, error: readErr } = await supabase
    .from("conversations")
    .select("id, user_id, lead_status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; user_id: string; lead_status: string | null }>();
  if (readErr) {
    console.error("[leads] read failed", readErr);
    return NextResponse.json({ error: "Couldn't load this lead. Try again." }, { status: 500 });
  }
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

  const logRemark = (kind: "note" | "status", body: string) =>
    supabase.from("lead_remarks").insert({
      conversation_id: lead.id,
      user_id: lead.user_id,
      author_id: author.id,
      author_email: author.email,
      kind,
      body,
    });

  if ("status" in parsed.data) {
    const from = leadStatusOf(lead.lead_status);
    const to = parsed.data.status;
    if (from === to) return NextResponse.json({ ok: true, status: to });
    const { error } = await supabase
      .from("conversations")
      .update({ lead_status: to })
      .eq("id", lead.id)
      .eq("user_id", user.id);
    if (error) {
      console.error("[leads] status save failed", error);
      return NextResponse.json({ error: "Couldn't save the status. Try again." }, { status: 500 });
    }
    // The status is saved either way; a failed log line is only logged.
    const { error: logErr } = await logRemark("status", statusChangeRemark(from, to));
    if (logErr) console.error("[leads] status log failed", logErr);
    return NextResponse.json({ ok: true, status: to });
  }

  const remark = cleanRemark(parsed.data.remark);
  if (!remark) {
    return NextResponse.json(
      { error: `Write an update (up to ${MAX_REMARK_CHARS} characters).` },
      { status: 400 }
    );
  }
  const { error } = await logRemark("note", remark);
  if (error) {
    console.error("[leads] remark save failed", error);
    return NextResponse.json({ error: "Couldn't post the update. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
