-- Returning-contact identity (2026-08-05).
--
-- Conversations are keyed by (chatbot_id, manychat_subscriber_id). When an owner
-- DELETES a contact in ManyChat and the person messages again, ManyChat issues a
-- BRAND-NEW subscriber_id, so the webhook creates a fresh conversation row with every
-- silence flag empty - and the bot resumes even though the old thread was paused.
--
-- external_user_id stores a STABLE platform user id that survives that deletion
-- (Messenger PSID / Instagram id, or the IG @handle as a fallback), mapped in from the
-- ManyChat flow. The webhook uses it to re-identify a returning contact and carry the
-- prior thread's pause (status ai_paused / user_muted_at / bot_off_at / confirmed_at /
-- disqualified tag) onto the new row. Null = no stable id available (older rows, or a
-- flow that maps none); such contacts fall back to today's behavior.
alter table public.conversations
  add column if not exists external_user_id text;

create index if not exists conversations_ext_user_idx
  on public.conversations(chatbot_id, external_user_id);

-- Backfill Instagram identities from the stored @handle so a pause/mute set BEFORE this
-- fix still carries when the contact is later deleted+recreated. IG's contact_username is
-- the real @handle (stable + unique per account); Messenger's is not, so this is
-- Instagram-only. Guards mirror resolveExternalId: a single token (no whitespace), non-
-- empty, and never a stray merge tag. Idempotent - only fills rows still NULL, so
-- re-running is a no-op and it never overwrites an id the webhook already set.
update public.conversations
set external_user_id = contact_username
where platform = 'instagram'
  and external_user_id is null
  and contact_username is not null
  and length(contact_username) > 0
  and contact_username !~ '[[:space:]]'
  and contact_username not like '%{%';

-- Teardown:
-- drop index if exists conversations_ext_user_idx;
-- alter table public.conversations drop column if exists external_user_id;
-- (The backfill only sets a column that the teardown drops, so no separate undo needed.)
