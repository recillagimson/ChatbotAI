-- ===========================================================================
-- Disqualify / detected-bot tags (2026-07-14)
-- ===========================================================================
-- Two new conversation tags that make the bot go fully silent AND pause the
-- follow-up drip, set by a pre-reply AI screen (lib/conversation-screen.ts):
--   disqualified - abusive toward the bot, or a clear rejection of the service
--   bot          - the counterparty is itself an automated bot / spam
-- Both are owner-only-reopen (auto-classification never moves them back). No new
-- columns - only the tag CHECK is widened. Apply BEFORE deploying the code that
-- can write these tags. Idempotent - safe to re-run.
--
-- Apply in the Supabase SQL editor.

alter table public.conversations drop constraint if exists conversations_tag_check;
alter table public.conversations add constraint conversations_tag_check
  check (tag in ('lead','wants_call','starting_later','needs_human','subscribed','disqualified','bot'));

-- Teardown (also re-narrow any rows first if you have written the new tags):
-- alter table public.conversations drop constraint if exists conversations_tag_check;
-- alter table public.conversations add constraint conversations_tag_check
--   check (tag in ('lead','wants_call','starting_later','needs_human','subscribed'));
