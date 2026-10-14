-- Public client questionnaire (/intake). A prospective or new client fills it in
-- WITHOUT an account; POST /api/intake validates it (lib/intake.ts) and inserts here
-- with the service role. Only the SpeedSettr team (superadmins) can read or update
-- rows - there is deliberately NO anon/authenticated insert policy, so the table
-- cannot be written from a browser directly, only through the validated route.
-- Re-runnable. Apply in the Supabase SQL editor BEFORE deploying.

create table if not exists public.client_intakes (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  status      text not null default 'new' check (status in ('new', 'reviewed')),
  name        text not null,
  email       text not null,
  instagram   text not null,
  business    text,
  answers     jsonb not null default '{}'::jsonb
);

create index if not exists client_intakes_created_at on public.client_intakes (created_at desc);

alter table public.client_intakes enable row level security;

drop policy if exists "client intakes: superadmin reads" on public.client_intakes;
create policy "client intakes: superadmin reads" on public.client_intakes
  for select using ( public.is_superadmin() );

drop policy if exists "client intakes: superadmin updates" on public.client_intakes;
create policy "client intakes: superadmin updates" on public.client_intakes
  for update using ( public.is_superadmin() ) with check ( public.is_superadmin() );

revoke insert, delete, truncate on public.client_intakes from anon, authenticated;
