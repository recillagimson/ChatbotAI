-- ===========================================================================
-- Self-service pause/resume (2026-07-06)
-- ===========================================================================
-- A lead can silence the AI for their own conversation by texting "stopmessage"
-- and turn it back on with "resumemessage" (lib/user-controls.ts; webhook gate
-- 6-mute). Tracked here on conversations.user_muted_at (null = not muted), kept
-- INDEPENDENT of the owner's human-takeover (status='ai_paused') so a lead can't
-- resume a chat a human agent has taken over. Best-effort writes + a fail-open
-- read (missing column = not muted) keep the app safe to deploy either side of
-- this migration.
--
-- Apply in the Supabase SQL editor. Idempotent.

alter table public.conversations
  add column if not exists user_muted_at timestamptz;

-- Teardown:
-- alter table public.conversations drop column if exists user_muted_at;
