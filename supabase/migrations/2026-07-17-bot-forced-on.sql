-- ManyChat BOT_ON tag sync (2026-07-17): manual per-conversation override.
-- Set by the webhook from a bot_on flag (the owner's BOT_ON tag automation). While
-- set, the contact is treated as "engaged" so the keyword-only gate (keyword_gate_enabled)
-- is bypassed and the bot replies to them regardless of whether their message matches a
-- keyword - the manual inverse of BOT_OFF. Null = no override (normal keyword-gate behavior).
alter table public.conversations
  add column if not exists bot_forced_on_at timestamptz;

-- Teardown:
-- alter table public.conversations drop column if exists bot_forced_on_at;
