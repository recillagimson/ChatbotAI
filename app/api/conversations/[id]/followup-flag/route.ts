import { NextResponse, type NextRequest } from "next/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { syncNoFollowupFlag } from "@/lib/followup-flag";

export const runtime = "nodejs";

/**
 * Reconcile the ManyChat `ss_no_followup` tag for a conversation after a MANUAL
 * inbox change (Mark subscribed, Pause AI/take over, un-mute, tag dropdown). The
 * ManyChat key is server-only, so the browser posts here after its optimistic
 * Supabase write. Best-effort: syncNoFollowupFlag reads DB truth and never throws.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const user = await getCurrentUser(); // impersonation-aware (admin view-as) — gotcha #7
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  // RLS scopes to the caller's own conversations; explicit user_id = clean 404.
  const { data: convo, error } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (error || !convo) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  await syncNoFollowupFlag(supabase, id);
  return NextResponse.json({ ok: true });
}
