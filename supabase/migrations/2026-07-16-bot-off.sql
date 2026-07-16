-- Per-conversation ManyChat BOT_OFF sync. When a subscriber is tagged BOT_OFF in
-- ManyChat, a tag-change automation POSTs bot_off=true/false to the webhook, which
-- sets/clears this column. While set, the bot is fully silent for that subscriber:
-- the webhook 6-bot-off gate skips auto-replies and the follow-up cron skips the drip.
-- Null = bot on. No backfill — null default = the safe/legacy "on" state.
alter table public.conversations
  add column if not exists bot_off_at timestamptz;

-- Teardown:
-- alter table public.conversations drop column if exists bot_off_at;
