-- ===========================================================================
-- "Starting later" tag + start date (2026-07-13)
-- ===========================================================================
-- A lead who says they'll begin on a future date ("Wednesday", "in a week") gets
-- the new `starting_later` tag, which PAUSES the auto follow-up drip (AI replies
-- stay on) until the owner changes the tag. The date is informational: shown
-- beside the badge and fed to the AI so it remembers when they want to start.
--   start_on   - resolved date (YYYY-MM-DD); nullable
--   start_note - the human phrase the lead used; nullable
-- Fail-open: missing columns read as null via the app's ?? defaults.
-- Apply BEFORE deploying the code that reads them. Idempotent - safe to re-run.
--
-- Apply in the Supabase SQL editor.

alter table public.conversations
  add column if not exists start_on date,
  add column if not exists start_note text;

-- Extend the tag CHECK to include starting_later (drop/re-add lists all values;
-- an inline check on `add column if not exists` is skipped once the column exists).
alter table public.conversations drop constraint if exists conversations_tag_check;
alter table public.conversations add constraint conversations_tag_check
  check (tag in ('lead','wants_call','starting_later','needs_human','subscribed'));

-- Teardown:
-- alter table public.conversations drop constraint if exists conversations_tag_check;
-- alter table public.conversations add constraint conversations_tag_check
--   check (tag in ('lead','wants_call','needs_human','subscribed'));
-- alter table public.conversations drop column if exists start_on;
-- alter table public.conversations drop column if exists start_note;
