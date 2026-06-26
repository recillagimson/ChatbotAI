import { cookies } from "next/headers";
import { cache } from "react";
import { createClient, getRealUser } from "@/lib/supabase/server";

/**
 * Admin "View as client" impersonation.
 *
 * A superadmin can drop into a client's real dashboard and act as them. The
 * target client id lives in an httpOnly cookie; `resolveViewAs` turns it into an
 * effective identity ONLY after re-verifying, on every read, that the real user
 * is a superadmin — so a forged cookie does nothing for a normal user. The
 * effective identity feeds `getCurrentUser()` (lib/supabase/server.ts), which is
 * what the whole client dashboard already scopes by, so no dashboard page needs
 * to change. Auth gates (requireSuperadmin, admin layout) deliberately use
 * `getRealUser()` instead, so the admin can never lock themselves out.
 */
export const VIEW_AS_COOKIE = "sps_view_as";

type ViewAsTarget = { id: string; email: string | null; full_name: string | null };

/**
 * The impersonation target for this request, or null. Cached per request.
 * Returns a target only when: there's a real user, the cookie is set to a
 * different user, the real user is a verified superadmin, and the target profile
 * exists. Reads run under the admin's own session (the superadmin RLS overlay
 * authorizes reading any profile).
 */
export const resolveViewAs = cache(async (): Promise<ViewAsTarget | null> => {
  const real = await getRealUser();
  if (!real) return null;

  const cookieStore = await cookies();
  const clientId = cookieStore.get(VIEW_AS_COOKIE)?.value;
  if (!clientId || clientId === real.id) return null;

  const supabase = await createClient();
  const { data: me } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", real.id)
    .maybeSingle();
  if (!me?.is_superadmin) return null;

  const { data: target } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("id", clientId)
    .maybeSingle();
  if (!target) return null;

  return { id: target.id, email: target.email ?? null, full_name: target.full_name ?? null };
});

/** Effective identity for impersonation, shaped like getCurrentUser's return. */
export async function getViewAsTarget(): Promise<{ id: string; email: string | null } | null> {
  const target = await resolveViewAs();
  return target ? { id: target.id, email: target.email } : null;
}

/** Real user + impersonation target + active flag — for the banner and guards. */
export async function getImpersonation(): Promise<{
  real: { id: string; email: string | null } | null;
  target: ViewAsTarget | null;
  active: boolean;
}> {
  const [real, target] = await Promise.all([getRealUser(), resolveViewAs()]);
  return { real, target, active: !!target };
}

/** Set the impersonation cookie (route handlers only — they can write cookies). */
export async function setViewAs(clientId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(VIEW_AS_COOKIE, clientId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
}

/** Clear the impersonation cookie. */
export async function clearViewAs(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(VIEW_AS_COOKIE);
}
