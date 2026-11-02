-- =============================================================================
-- Lead contact capture: the phone number / email a lead typed in a DM, saved on
-- the conversation so the team can reach them outside SpeedSettr. A new one also
-- flags the thread "Needs attention" and posts a Slack alert
-- (lib/lead-contact.ts, lib/lead-contact-server.ts).
--
-- Access needs no new policy: conversations already lets an owner read their own
-- rows and the superadmin overlay covers every row.
--
-- DEPLOY ORDER: run this BEFORE deploying the app. "Reset conversation" clears
-- these columns and would fail without them. (The webhook itself is safe either
-- way: before this runs its save fails and is logged, nothing is tagged or posted.)
-- LOCKING: nullable columns with no default are metadata-only, but ALTER still
-- takes a brief lock on conversations. lock_timeout makes it fail fast; if it
-- times out, nothing changed - run it again.
--
-- HOW TO RUN: paste the whole file into the Supabase SQL editor and run it once.
-- Safe to run again.
-- ROLLBACK:
--   alter table public.conversations drop column if exists lead_phone,
--     drop column if exists lead_email, drop column if exists lead_contact_at;
-- =============================================================================

begin;
set local lock_timeout = '5s';

alter table public.conversations
  add column if not exists lead_phone text,
  add column if not exists lead_email text,
  add column if not exists lead_contact_at timestamptz;

commit;

-- VERIFY (should return 3 rows):
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'conversations'
--    and column_name like 'lead_%';
