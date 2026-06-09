import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session and read the user's claims. getClaims() is Supabase's
  // current recommended middleware call: it loads (and refreshes) the token and
  // writes cookies just like getUser() did, but verifies the JWT *locally* — no
  // network round-trip per navigation — once the project has asymmetric JWT
  // signing keys enabled. On legacy symmetric keys it transparently falls back
  // to a network call (same as getUser), so this is never slower than before.
  const { data: claimsData } = await supabase.auth.getClaims();
  const isAuthed = !!claimsData?.claims;

  const { pathname } = request.nextUrl;
  // NOTE: /reset-password is intentionally NOT an auth route — the recovery
  // link logs the user in first, and they must reach the page to set a new
  // password. Redirecting authed users away from it would break the flow.
  const isAuthRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/forgot-password");
  const isProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/conversations") ||
    pathname.startsWith("/knowledge-base") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/billing") ||
    pathname.startsWith("/onboarding");

  if (!isAuthed && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (isAuthed && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}
