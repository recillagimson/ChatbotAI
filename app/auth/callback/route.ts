import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Email confirmation / OAuth callback handler. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // `next` is set by flows that must stay signed in after the exchange
  // (e.g. password reset -> /reset-password). Signup confirmation sets no
  // `next`, so it falls through to the "verified, please log in" branch below.
  const next = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (next) return NextResponse.redirect(`${origin}${next}`);
      // Signup email confirmation: the email is now verified. Drop the session
      // the exchange just created and send them to log in fresh, so the flow
      // ends on a clear "email verified, you can log in now" screen.
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?verified=1`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
