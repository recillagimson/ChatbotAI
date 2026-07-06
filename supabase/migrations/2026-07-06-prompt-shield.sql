-- ===========================================================================
-- Prompt shield: anti-extraction flagging (2026-07-06)
-- ===========================================================================
-- Owner-visibility state for the anti-prompt-extraction defense. The webhook
-- (step 6b-shield) increments extraction_attempts and stamps flagged_at on
-- every detected extraction/reverse-engineering attempt (lib/extraction-detect.ts);
-- the dashboard renders a red "Flagged" badge when extraction_attempts > 0.
-- Writes are best-effort and reads default to 0, so the app is safe to deploy
-- before or after this migration (fail-open).
--
-- Apply in the Supabase SQL editor. Idempotent.

alter table public.conversations
  add column if not exists extraction_attempts int not null default 0,
  add column if not exists flagged_at timestamptz;

-- Teardown:
-- alter table public.conversations drop column if exists extraction_attempts;
-- alter table public.conversations drop column if exists flagged_at;
