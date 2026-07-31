-- ===========================================================================
-- Keyword-only reply mode (2026-07-06)
-- ===========================================================================
-- Per-chatbot toggle: when ON, the AI answers ONLY DMs that match a configured
-- keyword group (chatbots.keyword_triggers) and silently ignores everything
-- else - for personal/private accounts that don't want the bot replying to
-- unrelated people. Enforced in the webhook (gate 6-gate) via firstMatchingGroup.
-- Default false so existing bots are unaffected. The webhook READ is fail-open
-- (missing column → gate off, normal replies), BUT the dashboard keyword-triggers
-- save and the follow-up cron reference this column directly, so an unknown
-- column errors those paths. Apply this BEFORE deploying the code that uses it.
--
-- Apply in the Supabase SQL editor. Idempotent.

alter table public.chatbots
  add column if not exists keyword_gate_enabled boolean not null default false;

-- Teardown:
-- alter table public.chatbots drop column if exists keyword_gate_enabled;
