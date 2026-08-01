-- Per-chatbot: when true, classifier tags (subscribed/disqualified/bot) do NOT
-- silence the reactive auto-reply. BOT_OFF, human takeover, and lead opt-out
-- still silence. Default false = existing behavior.
alter table public.chatbots
  add column if not exists keep_replies_when_tagged boolean not null default false;
