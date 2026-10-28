-- TikTok flow per Media item.
--
-- ManyChat's TikTok Send Message has an Image block but nothing for video or audio,
-- and the webhook can only hand a picture back in its response (media_key) for the
-- owner's flow to send behind one Condition per picture. An owner can now pick a
-- ManyChat flow on a Media item instead: when the bot sends that item on TikTok, the
-- webhook starts the flow through the ManyChat API (sendFlow) a moment after the reply.
-- Other channels ignore these columns and send the file as before.
--
-- Both nullable, no default: an item without a flow behaves exactly as today. The app
-- reads followup_assets with select('*'), so it keeps working before this is applied;
-- only saving a TikTok flow on the Media tab needs it.
--
-- Re-runnable. Apply in the Supabase dashboard SQL editor.
-- Rollback: alter table public.followup_assets drop column if exists tiktok_flow_ns,
--   drop column if exists tiktok_flow_name;

alter table public.followup_assets
  add column if not exists tiktok_flow_ns text,    -- ManyChat flow ns started on TikTok instead of the file
  add column if not exists tiktok_flow_name text;  -- that flow's name, for the Media tab
