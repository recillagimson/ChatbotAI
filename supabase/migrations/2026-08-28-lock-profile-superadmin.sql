-- 2026-08-28-lock-profile-superadmin.sql
-- CRITICAL SECURITY FIX (privilege escalation). APPLY URGENTLY - independent of any feature.
--
-- profiles.is_superadmin was self-writable by any authenticated user. The RLS policy
-- "own profile write" is `for update using (auth.uid() = id)` with NO with-check, so
-- Postgres reuses the USING expression as the check; with `id` unchanged, an UPDATE that
-- also set is_superadmin=true passed. Combined with the default table GRANT to the
-- `authenticated` role (has_column_privilege(...,'is_superadmin','UPDATE') = true, verified
-- live) and no guard trigger on profiles, any logged-in client could escalate:
--   PATCH {SUPABASE_URL}/rest/v1/profiles?id=eq.<their-own-id>
--   apikey: <public NEXT_PUBLIC_SUPABASE_ANON_KEY>   Authorization: Bearer <their JWT>
--   body: {"is_superadmin": true}
-- On the next request is_superadmin() returns true for them, unlocking every "admin all *"
-- RLS overlay (full cross-tenant read/write of chatbots, conversations, knowledge_base,
-- messages, followup_assets) and the service-client admin API routes. This repairs the
-- superadmin trust anchor the whole admin surface depends on.
--
-- Safe: no app code writes is_superadmin through an RLS/browser client (grep: only the
-- type in lib/types.ts). Admin promotion is done out-of-band via the service_role, which
-- bypasses column grants AND the trigger's auth.uid()-IS-NULL path, so provisioning is
-- unaffected.
--
-- APPLIED 2026-08-28 to prod (gqzdlrdzxlzpptsspxik) via MCP and VERIFIED: a simulated
-- authenticated non-admin UPDATE of its own is_superadmin is blocked by the trigger
-- (self_elevation_blocked=true, rolled back). NOTE the column REVOKE below is a NO-OP on
-- this DB: Supabase grants `authenticated` a TABLE-level UPDATE that supersedes a
-- column-level revoke (has_column_privilege still reports true after it). The TRIGGER is
-- therefore the actual enforcement; the revoke is kept only as harmless intent/marker.
-- (Making the revoke bite would require `revoke update on profiles` + re-granting every
-- other column - fragile, and unnecessary given the trigger.)

-- 1. Marker only (no-op while the broad table grant exists - see note above).
revoke update (is_superadmin) on public.profiles from anon, authenticated;

-- 2. THE ENFORCEMENT: block an authenticated non-superadmin from changing is_superadmin.
--    Mirrors guard_admin_only_chatbot_cols; the auth.uid() IS NULL check lets the
--    service_role (and existing superadmins) through.
create or replace function public.guard_profile_superadmin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_superadmin is distinct from old.is_superadmin
     and auth.uid() is not null
     and not public.is_superadmin() then
    raise exception 'is_superadmin is not self-assignable'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_superadmin on public.profiles;
create trigger guard_profile_superadmin
  before update on public.profiles
  for each row execute function public.guard_profile_superadmin();

-- Verify after apply - as a NON-admin session both must fail (permission denied / 0 rows):
--   update public.profiles set is_superadmin = true where id = auth.uid();
--   -- via PostgREST: PATCH profiles?id=eq.<own-id> {"is_superadmin":true}
