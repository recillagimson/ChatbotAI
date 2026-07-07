-- ===========================================================================
-- Lead tagging via webhook (2026-07-07)
-- ===========================================================================
-- The ManyChat webhook accepts `is_leads: 1` to silently tag a contact as an
-- engaged lead WITHOUT replying (e.g. an Instagram commenter routed here by a
-- ManyChat keyword). conversations.is_lead is treated as "engaged" by the keyword
-- gate (webhook 6-gate), so the lead's LATER DMs get bot replies even when the
-- gate is on. The bot does NOT proactively reach out: a tagged lead keeps
-- keyword_fired empty, so the follow-up cron (when gated) skips it until the lead
-- actually messages. Fail-open: missing column reads as not-a-lead.
-- Apply BEFORE deploying the code that reads it.
--
-- Apply in the Supabase SQL editor. Idempotent.

alter table public.conversations
  add column if not exists is_lead boolean not null default false;

-- Teardown:
-- alter table public.conversations drop column if exists is_lead;
