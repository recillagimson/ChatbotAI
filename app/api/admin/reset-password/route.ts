import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSuperadmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_PASSWORD_MIN = 8;

const Body = z.object({
  userId: z.string().uuid(),
  password: z.string().min(ADMIN_PASSWORD_MIN).max(72),
});

/**
 * POST /api/admin/reset-password - a superadmin sets a new password for a
 * client who is locked out. The admin then passes it to the client, who can
 * change it under Settings. Superadmin-only (requireSuperadmin reads the REAL
 * admin, never a "view as" client); the write needs the service role because
 * only the Supabase Auth admin API can change another user's password.
 */
export async function POST(request: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Password must be ${ADMIN_PASSWORD_MIN} to 72 characters.` },
      { status: 400 }
    );
  }
  const { userId, password } = parsed.data;

  const supabase = createServiceClient();
  const { error } = await supabase.auth.admin.updateUserById(userId, { password });
  if (error) {
    console.error("[admin/reset-password] failed", { userId, error: error.message });
    const notFound = /not.?found/i.test(error.message);
    return NextResponse.json(
      { error: notFound ? "User not found." : error.message || "Could not reset the password." },
      { status: notFound ? 404 : 500 }
    );
  }

  console.info("[admin/reset-password] password reset", { userId, by: admin.id });
  return NextResponse.json({ ok: true });
}
