-- =============================================================================
-- Per-bot Slack alerts for lead contacts: each chatbot holds its own Slack
-- Incoming Webhook link, so one client's leads post only to that client's
-- channel (lib/lead-contact-server.ts). Set by a superadmin from the chatbot's
-- Overview tab (POST /api/admin/chatbots/[id]/slack-alert). Null = no alert; the
-- contact is still saved and the thread still tagged Needs attention.
--
-- DEPLOY ORDER: either way round. The webhook reads the column from select("*"),
-- so before this runs it reads as unset, and the card's Save reports an error.
-- HOW TO RUN: paste the whole file into the Supabase SQL editor and run it once.
-- Safe to run again.
-- ROLLBACK: alter table public.chatbots drop column if exists slack_alert_url;
-- =============================================================================

begin;
set local lock_timeout = '5s';

alter table public.chatbots
  add column if not exists slack_alert_url text;

commit;

-- VERIFY (should return 1 row):
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'chatbots' and column_name = 'slack_alert_url';
