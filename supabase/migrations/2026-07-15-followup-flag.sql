-- Per-chatbot opt-in for the ManyChat "stop follow-up" flag bridge.
-- When true, SpeedSettr adds/removes the ManyChat tag `ss_no_followup` on a
-- subscriber as the conversation enters/leaves a stop-follow-up state, so a native
-- ManyChat voice-note drip can Condition-exit on it. Default false: no writes to a
-- tenant that hasn't set up the voice flow + tag in ManyChat.
alter table public.chatbots
  add column if not exists followup_flag_enabled boolean not null default false;
