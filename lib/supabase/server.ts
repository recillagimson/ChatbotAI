import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { createClient as createServiceClientBase } from "@supabase/supabase-js";
import { getViewAsTarget } from "@/lib/impersonation";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // called from a Server Component; ignored - middleware refreshes session
          }
        },
      },
    }
  );
}

/**
 * The current authenticated user (id + email), read from verified JWT claims.
 * Wrapped in React `cache()` so it runs at most once per server request even
 * when the layout and the page both ask for it. Uses getClaims() rather than
 * getUser(): once the project has asymmetric JWT signing keys enabled it
 * verifies locally with no network round-trip; on legacy symmetric keys it
 * falls back to a network call, so it's never slower than before. The token is
 * already refreshed by middleware at the top of the request. Returns null when
 * not signed in.
 *
 * Tradeoff: local verification trusts a valid, unexpired token, so a session
 * revoked elsewhere stays usable until the token expires (~1h). The actual data
 * boundary is Postgres RLS (which verifies every query server-side), so this is
 * the sanctioned default - but don't use these claims as a hard revocation gate.
 *
 * NOTE: this is the REAL authenticated user (the actual JWT). Use it for
 * authorization decisions (e.g. requireSuperadmin, the /admin gate) - NOT
 * `getCurrentUser`, which may be an impersonated client (see below).
 */
export const getRealUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;
  return {
    id: claims.sub as string,
    email: (claims.email as string | undefined) ?? null,
  };
});

/**
 * The EFFECTIVE acting user for data scoping. Normally the real user, but when a
 * superadmin is impersonating a client ("View as client"), this returns the
 * client's identity so the entire client dashboard - which scopes every query by
 * this id - transparently shows/acts on the client's account. Authorization
 * gates must NOT use this; use `getRealUser`. See lib/impersonation.ts.
 */
export const getCurrentUser = cache(async () => {
  const target = await getViewAsTarget();
  if (target) return target;
  return getRealUser();
});

/** Service-role client - bypasses RLS. Use only in server routes (webhooks, admin). */
export function createServiceClient() {
  return createServiceClientBase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
