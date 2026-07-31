-- "Answer opener questions" - softens the keyword gate for a keyword-gated bot so a
-- never-engaged stranger who OPENS with a genuine business question is answered by the
-- AI (and the conversation starts) instead of being silenced. Opt-in per chatbot, OFF by
-- default: an un-set-up bot behaves exactly as today. Two-stage + bounded in the webhook:
-- a free deterministic pre-filter, then a cheap-AI relevance screen; a pass stamps a
-- SEPARATE sticky flag (question_engaged_at) - deliberately NOT keyword_fired, so keyword
-- semantics / lead analytics stay clean and the follow-up cron does NOT auto-enroll these
-- contacts. question_screen_count caps the number of paid relevance screens per contact.
alter table public.chatbots
  add column if not exists keyword_gate_answer_questions boolean not null default false;

alter table public.conversations
  add column if not exists question_engaged_at timestamptz,
  add column if not exists question_screen_count integer not null default 0;

-- Teardown:
-- alter table public.chatbots drop column if exists keyword_gate_answer_questions;
-- alter table public.conversations drop column if exists question_engaged_at;
-- alter table public.conversations drop column if exists question_screen_count;
