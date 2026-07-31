import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Deterministic "is this email already registered?" check.
 *
 * RLS blocks the anon/browser client from reading other users' profiles, so
 * this runs server-side with the service-role key. Every signup writes a
 * `profiles` row (email NOT NULL) via the `handle_new_user` trigger - including
 * unconfirmed signups - so `profiles` is the source of truth. This replaces the
 * fragile `signUp().identities` heuristic, which only flags duplicates under
 * specific email-confirmation settings.
 *
 * By design this reveals whether an email is registered (the product wants
 * "email already in use" UX). Fails OPEN (exists:false) on any error so a
 * transient failure never blocks a legitimate signup; signUp() still backstops.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    return NextResponse.json({ exists: false });
  }
  try {
    const supabase = createServiceClient();
    // Supabase stores auth emails lowercased and the trigger copies that, so an
    // exact (lowercased) match is correct - and avoids ilike treating "_" in an
    // email local-part as a wildcard.
    const { count, error } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("email", email);
    if (error) {
      console.error("[check-email] query failed", error);
      return NextResponse.json({ exists: false });
    }
    return NextResponse.json({ exists: (count ?? 0) > 0 });
  } catch (err) {
    console.error("[check-email] error", err);
    return NextResponse.json({ exists: false });
  }
}
