-- ===========================================================================
-- Conversation tag / inbox bucket (2026-07-10)
-- ===========================================================================
-- A single tag per DM thread for the inbox filter + badge, auto-set each AI turn
-- by the tag classifier (lib/conversation-classify.ts) and manually overridable
-- from the conversation actions. Values:
--   lead        — engaged prospect (default)
--   wants_call  — wants to book a call / appointment / demo
--   needs_human — angry / asked for a human / complex issue (sticky until handled)
--   subscribed  — confirmed customer; coupled to confirmed_at, which silences the bot
-- Fail-open: missing column reads as 'lead' via the app's ?? default.
-- Apply BEFORE deploying the code that reads it. Idempotent — safe to re-run.
--
-- Apply in the Supabase SQL editor.

alter table public.conversations
  add column if not exists tag text not null default 'lead';

-- Named drop/re-add so a re-run picks up the constraint (an inline check on
-- `add column if not exists` is skipped once the column exists).
alter table public.conversations drop constraint if exists conversations_tag_check;
alter table public.conversations add constraint conversations_tag_check
  check (tag in ('lead','wants_call','needs_human','subscribed'));

-- Backfill: an already-confirmed contact is a subscriber.
update public.conversations set tag = 'subscribed'
  where confirmed_at is not null and tag = 'lead';

create index if not exists conversations_tag_idx on public.conversations (user_id, tag);

-- Teardown:
-- drop index if exists conversations_tag_idx;
-- alter table public.conversations drop constraint if exists conversations_tag_check;
-- alter table public.conversations drop column if exists tag;
