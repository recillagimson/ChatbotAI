-- Per-conversation ManyChat Live Chat deep-link source.
--
-- Problem: the Follow-ups queue's "Open in ManyChat" button linked to the ManyChat
-- account root (https://app.manychat.com/) for every card, so it opened the app's inbox
-- but never the specific thread.
--
-- Fix: capture, per conversation, what ManyChat needs to deep-link straight to the thread.
-- Two independent sources, EITHER alone is enough (see manychatConversationUrl in
-- lib/manual-followups.ts):
--
--   * manychat_live_chat_url - ManyChat's own per-subscriber Live Chat deep link, captured
--     verbatim from the inbound webhook when the flow maps the "Live Chat URL" system field
--     (via "Add Full Subscriber Data" on the External Request). Channel-safe: works for
--     Instagram / Messenger / WhatsApp / Telegram with no URL-format assumption. PREFERRED.
--
--   * manychat_page_id - the ManyChat page_id the inbound webhook already carries. The link
--     is built as https://app.manychat.com/fb{page_id}/chat/{manychat_subscriber_id},
--     verbatim-confirmed for Facebook Messenger and Instagram-via-Facebook.
--
-- Both nullable. When neither is known the button falls back to the account root exactly as
-- before, so nothing regresses. No index: these are read only alongside the conversation
-- row, never filtered on. Idempotent; existing rows backfill on the contact's next inbound
-- message (see app/api/webhooks/manychat/route.ts).

alter table public.conversations
  add column if not exists manychat_page_id text;
alter table public.conversations
  add column if not exists manychat_live_chat_url text;

-- Teardown (manual):
-- alter table public.conversations drop column if exists manychat_page_id;
-- alter table public.conversations drop column if exists manychat_live_chat_url;
