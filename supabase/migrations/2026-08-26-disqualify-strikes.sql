-- ===========================================================================
-- Disqualify two-strike backstop (2026-08-26)
-- ===========================================================================
-- A false `disqualified` tag silences a good lead forever, and the one-word screen
-- model (webhook step 7b) can misfire on an ENGAGED lead who is merely venting or
-- describing a past failure ("I've tried before, no success"). This counter lets the
-- webhook require TWO consecutive disqualify signals from an already-engaged lead
-- before writing the terminal tag: the first signal is a soft strike (bumps this
-- counter, bot keeps replying); the second silences. A non-disqualify turn resets it
-- to 0 (strikes must be consecutive). See lib/conversation-screen.ts decideDisqualify.
--
-- Best-effort writes + default-0 reads keep the webhook fail-open either side of this
-- migration: with the column absent there is NO soft path and behaviour is exactly as
-- before (immediate silence), so the app is safe to deploy before OR after this.
--
-- Apply in the Supabase SQL editor. Idempotent.

alter table public.conversations
  add column if not exists disqualify_strikes int not null default 0;

-- Teardown:
-- alter table public.conversations drop column if exists disqualify_strikes;
