-- Per-chatbot opt-in: render links as tappable URL buttons on Facebook/Messenger.
-- Default OFF for every bot, so no client changes until its owner turns it on.
-- Replaces the old global LINK_BUTTONS_ENABLED env switch as the primary control
-- (the env var still works as a global override - see lib/manychat.ts buttonsSupported).
-- Messenger-only: Instagram doesn't support URL buttons (and strips links anyway),
-- so this flag has no effect on non-Messenger channels.
alter table public.chatbots
  add column if not exists link_buttons_enabled boolean not null default false;
