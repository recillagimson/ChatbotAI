-- ===========================================================================
-- Per-chatbot reply-wait window (2026-07-20)
-- ===========================================================================
-- reply_debounce_seconds overrides the global REPLY_DEBOUNCE_MS env per chatbot:
-- the quiet period (in SECONDS) the webhook waits for the lead to stop sending
-- before it answers, so a rapid burst - and a photo sent alongside its caption -
-- collapses into ONE consolidated reply. The timer effectively resets each time
-- the lead sends another message (single-flight claim on conversations.reply_claimed_for).
--
-- Default 60 (one minute). App code clamps to 0..120s (clampDebounceSeconds in
-- lib/debounce.ts); 0 = answer immediately but still never double-reply
-- (single-flight consolidation stays on). The webhook READ is fail-open: a missing
-- column falls back to the REPLY_DEBOUNCE_MS env (5s), so deploying the code
-- before this migration is safe. This is per-CHATBOT config; the per-conversation
-- claim column (conversations.reply_claimed_for) is separate and unchanged.
--
-- IMPORTANT: a 60s+ background sleep needs Vercel Pro (maxDuration 300). On the
-- 60s Hobby budget the function is killed at 60s before it can generate/push.
--
-- Apply in the Supabase SQL editor. Idempotent.

alter table public.chatbots
  add column if not exists reply_debounce_seconds int not null default 60;

-- Teardown:
-- alter table public.chatbots drop column if exists reply_debounce_seconds;
