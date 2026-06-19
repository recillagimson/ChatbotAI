import { createClient, getCurrentUser } from "@/lib/supabase/server";

/**
 * Returns the current user IFF they are a superadmin, else null.
 * Reads profiles.is_superadmin under the caller's RLS (own-profile read is allowed).
 * API routes 403 on null; the admin layout redirects on null.
 */
export async function requireSuperadmin(): Promise<{ id: string; email: string | null } | null> {
  const user = await getCurrentUser();
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
