-- =============================================================================
-- Per-chatbot: when true, a subscribed user (conversations.confirmed_at set) still
-- gets the reactive auto-reply. Their follow-up drip stays off either way. Split out
-- of keep_replies_when_tagged, which now covers only disqualified and Bot / Spam
-- threads. A "Needs attention" flag never silences the bot. BOT_OFF, human takeover
-- and a lead's opt-out still silence it. (CLAUDE.md #34, lib/conversation-silence.ts.)
--
-- BACKFILL: the run that creates the column copies keep_replies_when_tagged into
-- it, so every bot that already kept replying when tagged keeps answering its
-- subscribed users. It runs ONLY in that run: afterwards the two switches are
-- independent, and a re-run must never switch one back on that an owner turned off.
-- So the whole file is safe to run again; a second run changes nothing.
--
-- DEPLOY ORDER: either way round. Until this runs, the app reads the column as
-- missing and lets keep_replies_when_tagged decide, as before. Best back to back:
-- in between, an old build's tagged switch changes only the old column.
--
-- LOCKING: ADD COLUMN with a constant default is metadata-only (no rewrite), but it
-- still needs a brief ACCESS EXCLUSIVE lock on chatbots, which the webhook reads on
-- every DM. lock_timeout makes it fail fast rather than queue behind a long
-- transaction and stall those reads. If it times out, nothing has changed (it is one
-- transaction); just run it again.
--
-- HOW TO RUN: paste the whole file into the SQL editor and run it once, then VERIFY.
-- ROLLBACK: alter table public.chatbots drop column if exists keep_replies_when_subscribed;
-- (the app then falls back to keep_replies_when_tagged for subscribed users).
-- =============================================================================

begin;

set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'chatbots'
      and column_name = 'keep_replies_when_subscribed'
  ) then
    alter table public.chatbots
      add column keep_replies_when_subscribed boolean not null default false;

    update public.chatbots
      set keep_replies_when_subscribed = true
      where keep_replies_when_tagged;
  end if;
end
$$;

commit;

-- VERIFY (read-only): the column exists, and right after the first run every bot
-- that keeps replying when tagged also keeps replying to subscribed users.
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'chatbots'
--     and column_name = 'keep_replies_when_subscribed';
-- select count(*) filter (where keep_replies_when_tagged) as tagged,
--        count(*) filter (where keep_replies_when_subscribed) as subscribed
--   from public.chatbots;
