import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSuperadmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  status: z.enum(["new", "read", "resolved"]),
  admin_note: z.string().max(4000).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { id } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { status, admin_note } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("feedback")
    .update({
      status,
      admin_note: admin_note ?? null,
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: "Could not update feedback." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
