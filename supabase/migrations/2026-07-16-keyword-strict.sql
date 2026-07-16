-- Per-chatbot toggle: when ON, keyword-trigger matching requires the WHOLE inbound
-- message to EQUAL a keyword (after normalize + surrounding punctuation/emoji strip),
-- instead of the default whole-word "contains" match. So "credit" starts/engages only
-- on a message that IS "credit", not "i have a problem with my credit". Read in the
-- webhook 6-gate firstMatchingGroup(...) call. Default false; fail-open (missing
-- column = contains-match). No backfill needed — false is the legacy behavior.
alter table public.chatbots
  add column if not exists keyword_strict_enabled boolean not null default false;

-- Teardown:
-- alter table public.chatbots drop column if exists keyword_strict_enabled;
