-- Welcome ⇄ Keywords sync. When ON, the first-message Welcome VM also fires when a
-- new contact's opener matches one of the chatbot's Keywords-tab triggers
-- (keyword_triggers), reusing the exact same matcher - so the owner keeps ONE keyword
-- list instead of maintaining welcome_keywords separately. Default off: existing bots
-- behave exactly as before (greeting / welcome_keywords / comment opt-in only).
alter table public.chatbots
  add column if not exists welcome_use_keyword_triggers boolean not null default false;

-- Teardown:
-- alter table public.chatbots drop column if exists welcome_use_keyword_triggers;
