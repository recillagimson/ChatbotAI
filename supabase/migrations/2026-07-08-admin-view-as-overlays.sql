-- Admin "view as" RLS overlays: let a superadmin fully operate a client's inbox
-- while impersonating. "View as" swaps getCurrentUser() only; the Supabase session
-- (and auth.uid()) stays the admin, so cross-tenant access relies on is_superadmin()
-- permissive overlays. Two gaps fixed here (re-runnable):
--   1. messages had NO admin overlay -> "No messages yet" under view-as. It has no
--      user_id column (ownership via the conversation), so add read+write (write is
--      needed for the human-agent manual-reply insert).
--   2. conversations had a SELECT-only admin overlay -> Pause AI / Mark confirmed /
--      Un-mute / mark-read / manual-reply update no-opped under view-as. Upgrade to
--      full access. Mirrors the existing "admin all kb"/"admin all chatbots" shape;
--      only the admin's real auth.uid() satisfies is_superadmin(), so normal tenants
--      (base "own ..." policies) and the service-role webhook/cron are unaffected.

drop policy if exists "admin all messages" on public.messages;
create policy "admin all messages" on public.messages for all
  using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists "admin read conversations" on public.conversations;
drop policy if exists "admin all conversations" on public.conversations;
create policy "admin all conversations" on public.conversations for all
  using (public.is_superadmin()) with check (public.is_superadmin());

-- Teardown (down-migration), if pulled:
-- drop policy if exists "admin all messages" on public.messages;
-- drop policy if exists "admin all conversations" on public.conversations;
-- create policy "admin read conversations" on public.conversations for select using (public.is_superadmin());
