-- Inbound media support: store a durable pointer to a photo/voice/file a
-- contact sent, so the team inbox can render it. Both columns are nullable;
-- existing text-only messages are unaffected (no backfill needed).
--
-- media_url   = storage path in the request-uploads bucket (sign on render),
--               or an external URL. NULL for plain text messages.
-- media_type  = MIME type of the attachment (e.g. image/jpeg, audio/m4a). NULL
--               for plain text.
--
-- Apply in the Supabase dashboard SQL editor before deploying the media feature.
alter table public.messages add column if not exists media_url text;
alter table public.messages add column if not exists media_type text;
