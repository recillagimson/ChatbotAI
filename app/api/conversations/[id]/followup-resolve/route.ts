import { NextResponse, type NextRequest } from "next/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { dayBandHiFor } from "@/lib/manual-followups";

export const runtime = "nodejs";

/**
 * Mark a manual follow-up thread "resolved" for its CURRENT age band - the user did the
 * follow-up by hand in ManyChat. Records WHEN (followup_resolved_at) and the band's upper
 * edge in hours (followup_resolved_hi), so the Follow-ups queue hides the thread from this
 * band and re-surfaces it in the next band if the lead still hasn't replied. A later lead
 * reply (a newer inbound) auto-invalidates the resolve - see followupResolvedHidden - so no
 * webhook write is needed to reset it.
 *
 * Body: { band: "d1" | "d3" | "d5" | "d7" }. The band is the day-band view the card is in;
 * all cards in a day-band view belong to that band, and the server maps it to the stored
 * upper edge via the shared DAY_BANDS so client and queue can't disagree.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const user = await getCurrentUser(); // impersonation-aware (admin view-as)
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let band: unknown;
  try {
    band = (await request.json())?.band;
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const hi = typeof band === "string" ? dayBandHiFor(band) : null;
  if (hi == null) {
    return NextResponse.json({ error: "invalid band" }, { status: 400 });
  }

  const supabase = await createClient();
  // RLS scopes to the caller's own conversations; the explicit user_id makes a
  // miss a clean 404 rather than a silent no-op.
  const { data, error } = await supabase
    .from("conversations")
    .update({
      followup_resolved_at: new Date().toISOString(),
      followup_resolved_hi: hi,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
