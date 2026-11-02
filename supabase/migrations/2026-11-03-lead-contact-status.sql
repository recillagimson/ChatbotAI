-- =============================================================================
-- Lead contacts page (/leads): a follow-up status per lead who sent a phone
-- number or email, and a log of remarks (updates) the account's team posts on
-- each lead. lib/lead-status.ts, app/(dashboard)/leads, /api/leads/[id].
--
--   conversations.lead_status : pending | reached_out | follow_up | done
--                               (null reads as pending)
--   lead_remarks              : one row per posted update or status change
--
-- Access: a client sees and writes only rows for their own conversations; the
-- superadmin overlay covers every row (so "View as client" works). Remarks are a
-- log: no update or delete policy for clients.
--
-- DEPLOY ORDER: run this BEFORE deploying the app ("Reset conversation" clears
-- lead_status, and the page reads both).
-- HOW TO RUN: paste the whole file into the Supabase SQL editor and run it once.
-- Safe to run again.
-- ROLLBACK:
--   drop table if exists public.lead_remarks;
--   drop index if exists public.conversations_lead_contacts_idx;
--   alter table public.conversations drop column if exists lead_status;
-- =============================================================================

begin;
set local lock_timeout = '5s';

alter table public.conversations
  add column if not exists lead_status text
    check (lead_status in ('pending', 'reached_out', 'follow_up', 'done'));

-- The page lists an account's leads that shared a contact, newest first.
create index if not exists conversations_lead_contacts_idx
  on public.conversations (user_id, lead_contact_at desc)
  where lead_contact_at is not null;

create table if not exists public.lead_remarks (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null,                 -- the account that owns the lead (conversation's user_id)
  author_id       uuid,                          -- who posted it (an admin under "View as client" is themselves)
  author_email    text,
  kind            text not null default 'note' check (kind in ('note', 'status')),
  body            text not null check (char_length(body) between 1 and 2000),
  created_at      timestamptz not null default now()
);
create index if not exists lead_remarks_conversation_idx
  on public.lead_remarks (conversation_id, created_at desc);

alter table public.lead_remarks enable row level security;

drop policy if exists "own lead_remarks read" on public.lead_remarks;
create policy "own lead_remarks read" on public.lead_remarks for select
  using (auth.uid() = user_id);

-- A client may only add a remark to a conversation they own.
drop policy if exists "own lead_remarks insert" on public.lead_remarks;
create policy "own lead_remarks insert" on public.lead_remarks for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.conversations c
       where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "admin all lead_remarks" on public.lead_remarks;
create policy "admin all lead_remarks" on public.lead_remarks for all
  using (public.is_superadmin()) with check (public.is_superadmin());

commit;

-- VERIFY (should return 1 row, then 1 row):
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'conversations' and column_name = 'lead_status';
-- select to_regclass('public.lead_remarks');
