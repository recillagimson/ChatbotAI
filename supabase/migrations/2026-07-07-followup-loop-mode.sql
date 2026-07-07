-- ===========================================================================
-- Follow-up loop mode (2026-07-07)
-- ===========================================================================
-- Supersedes the boolean auto_followup_loop_last ("repeat the final step
-- forever") with a 3-way loop mode so a drip can CYCLE through all steps in order
-- instead of endlessly repeating the last one. Read by evaluateFollowup
-- (lib/followup.ts), the follow-up cron, and the webhook's reply handler.
-- Backfilled from the legacy boolean so every current bot keeps its behavior.
-- Apply BEFORE deploying the code (the cron + webhook select this column).
--
-- Apply in the Supabase SQL editor. Idempotent.

alter table public.chatbots
  add column if not exists auto_followup_loop_mode text not null default 'stop';

-- Named drop/re-add so re-running picks up constraint changes (an inline check on
-- `add column if not exists` is silently skipped once the column exists).
alter table public.chatbots drop constraint if exists chatbots_auto_followup_loop_mode_check;
alter table public.chatbots add constraint chatbots_auto_followup_loop_mode_check
  check (auto_followup_loop_mode in ('stop', 'repeat_last', 'cycle'));

-- Backfill from the legacy boolean. Safe to re-run: only rewrites rows still at
-- the 'stop' default that were actually looping the last step.
update public.chatbots
set auto_followup_loop_mode = 'repeat_last'
where auto_followup_loop_last = true
  and auto_followup_loop_mode = 'stop';

-- Teardown:
-- alter table public.chatbots drop column if exists auto_followup_loop_mode;
