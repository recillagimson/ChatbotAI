import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parseIntakeSubmission } from "@/lib/intake";
import { checkIntakeLimit } from "@/lib/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/intake - the public client questionnaire (/intake). No login: anyone
 * with the link can submit. Defences: a per-IP limit (lib/limits.ts), a hidden
 * honeypot field and per-field size caps (lib/intake.ts), and the table itself has
 * no browser insert policy, so this validated route is the only way in. The insert
 * uses the service role for that reason - the sanctioned pattern for a write RLS
 * deliberately keeps away from anonymous browsers.
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkIntakeLimit(ip))) {
    return NextResponse.json(
      { error: "Too many submissions from this connection. Try again in an hour." },
      { status: 429 }
    );
  }

  const parsed = parseIntakeSubmission(await request.json().catch(() => null));
  // A filled honeypot is a bot: answer like a success so it learns nothing.
  if (!parsed.ok && parsed.spam) return NextResponse.json({ ok: true });
  if (!parsed.ok) {
    return NextResponse.json({ error: "Some answers need a look.", fields: parsed.errors }, { status: 400 });
  }

  const { name, email, instagram, business, answers } = parsed.value;
  const { error } = await createServiceClient()
    .from("client_intakes")
    .insert({ name, email, instagram, business, answers });
  if (error) {
    console.error("[intake] insert failed", error);
    return NextResponse.json(
      { error: "We couldn't save your answers. Please try again in a minute." },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
