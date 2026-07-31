import { createClient, getRealUser } from "@/lib/supabase/server";

/**
 * Returns the REAL current user IFF they are a superadmin, else null.
 * Uses getRealUser (never the impersonated identity) so that while a superadmin
 * is "viewing as" a client, the admin area and /api/admin/* still authorize the
 * actual admin - they can't lock themselves out by impersonating a non-admin.
 * Reads profiles.is_superadmin under the caller's RLS (own-profile read is allowed).
 * API routes 403 on null; the admin layout redirects on null.
 */
export async function requireSuperadmin(): Promise<{ id: string; email: string | null } | null> {
  const user = await getRealUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  if (!data?.is_superadmin) return null;
  return user;
}
