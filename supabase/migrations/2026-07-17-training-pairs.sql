-- Bot Trainer: per-chatbot scenario corrections the bot honors on every reply.
alter table public.chatbots
  add column if not exists training_pairs jsonb not null default '[]'::jsonb;
