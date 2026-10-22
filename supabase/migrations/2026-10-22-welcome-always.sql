-- =============================================================================
-- Per-chatbot: when true, EVERY new contact's first message gets the Welcome VM
-- (chatbots.welcome_flow_ns), not only a bare greeting / welcome keyword / comment
-- opt-in. A first message that says something (a question, detail, media) gets the
-- welcome AND an AI answer. (lib/welcome.ts welcomeAction, CLAUDE.md #25.)
--
-- DEPLOY ORDER: either way round. The webhook reads chatbots with select("*"), so
-- a missing column reads as off. The settings form writes the column only once it
-- exists or the owner turns the switch on.
--
-- HOW TO RUN: paste the whole file into the Supabase SQL editor and run it. Safe to
-- run again.
-- ROLLBACK: alter table public.chatbots drop column if exists welcome_always;
-- =============================================================================

begin;
set local lock_timeout = '5s';

alter table public.chatbots
  add column if not exists welcome_always boolean not null default false;

commit;

-- VERIFY (should return one row, default false):
-- select column_name, data_type, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'chatbots' and column_name = 'welcome_always';
