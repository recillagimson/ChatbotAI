import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSuperadmin } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { setViewAs, clearViewAs } from "@/lib/impersonation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ clientId: z.string().uuid() });

/**
 * POST /api/admin/view-as  { clientId }  → start impersonating that client.
 * DELETE /api/admin/view-as              → stop impersonating.
 *
 * Superadmin-only. The cookie set here is also re-verified on every read in
 * lib/impersonation.ts (resolveViewAs re-checks superadmin), so a forged cookie
 * is inert for a normal user - this gate is the primary control.
 */
export async function POST(request: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid client." }, { status: 400 });
  const { clientId } = parsed.data;

  if (clientId === admin.id) {
    return NextResponse.json({ error: "That's your own account." }, { status: 400 });
  }

  // Confirm the target exists (superadmin RLS overlay authorizes the read).
  const supabase = await createClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", clientId)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  // Other team members' accounts can be viewed too (an admin may also own bots).
  // Admin powers always come from the REAL signed-in user, never the viewed one.

  await setViewAs(clientId);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  // Only a real superadmin would have an active impersonation cookie; still,
  // gate so the endpoint isn't a generic cookie-clear for anyone.
  const admin = await requireSuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  await clearViewAs();
  return NextResponse.json({ ok: true });
}
