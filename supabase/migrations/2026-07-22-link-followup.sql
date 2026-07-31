-- Link-aware follow-up: a SEPARATE drip sequence used once the bot has sent the
-- lead a link, plus the durable "link sent" marker that switches a conversation
-- onto it. If a chatbot has no link steps configured, the usual sequence runs
-- (fallback) - so this is a no-op for every existing bot until they set it up.

-- 1. The alternate sequence (same JSONB shape as auto_followup_steps). Empty = fall
--    back to auto_followup_steps.
alter table public.chatbots
  add column if not exists auto_followup_link_steps jsonb not null default '[]'::jsonb;

-- 2. Durable marker: the first time an outbound bot message contains an http(s)
--    URL. Read by the follow-up engine to choose the link sequence.
alter table public.conversations
  add column if not exists link_sent_at timestamptz;

-- 3. Trigger: on any ASSISTANT message insert whose content carries a URL, stamp
--    the conversation's link_sent_at (set-once). One place catches EVERY outbound
--    path - the reactive AI reply, canned/keyword replies, and follow-up sends -
--    matching "any link the bot sends". security definer + fixed search_path so the
--    stamp lands regardless of which client inserted the message.
create or replace function public.mark_link_sent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'assistant'
     and new.content is not null
     and new.content ~* 'https?://[^[:space:]]' then
    update public.conversations
       set link_sent_at = now()
     where id = new.conversation_id
       and link_sent_at is null;   -- set-once: never churn / never move the marker
  end if;
  return new;
end;
$$;

drop trigger if exists messages_mark_link_sent on public.messages;
create trigger messages_mark_link_sent
  after insert on public.messages
  for each row execute function public.mark_link_sent();

-- Teardown:
-- drop trigger if exists messages_mark_link_sent on public.messages;
-- drop function if exists public.mark_link_sent();
-- alter table public.conversations drop column if exists link_sent_at;
-- alter table public.chatbots drop column if exists auto_followup_link_steps;
