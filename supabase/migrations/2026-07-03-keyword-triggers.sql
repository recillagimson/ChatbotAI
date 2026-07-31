-- Keyword triggers - per-chatbot keyword auto-reply with first-touch dedup.
--
-- chatbots.keyword_triggers = ordered JSONB array of keyword groups:
--   [{ id, keywords[], exclude[], first_reply_text, first_reply_asset_key?,
--      on_repeat: "ai"|"message"|"instruction", repeat_text?, instruction?, enabled }]
-- The webhook matches an inbound DM's text against each enabled group (case-
-- insensitive whole-word "contains"; ANY include AND NO exclude). The FIRST time
-- a contact matches a group it gets that group's canned first reply (text + an
-- optional saved followup asset) and the group's id is recorded on the
-- conversation; on later matches the group does its on_repeat action instead.
--
-- conversations.keyword_fired = JSONB array of group ids already delivered to
-- this contact (per-contact first-touch state, alongside followup_step_index /
-- confirmed_at / reply_claimed_for). Best-effort: a lost update just re-sends a
-- canned reply once (harmless), never strands the contact with no reply.
--
-- Re-runnable. Apply in the Supabase dashboard SQL editor BEFORE deploying the
-- keyword-trigger code (the code fail-opens - treats a missing column as "no
-- triggers configured" - so deploy ordering is safe either way).
alter table public.chatbots
  add column if not exists keyword_triggers jsonb not null default '[]'::jsonb;

alter table public.conversations
  add column if not exists keyword_fired jsonb not null default '[]'::jsonb;

-- Teardown:
-- alter table public.chatbots     drop column if exists keyword_triggers;
-- alter table public.conversations drop column if exists keyword_fired;
