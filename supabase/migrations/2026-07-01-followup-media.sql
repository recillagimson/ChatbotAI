-- Rich-media auto follow-up system.
--
-- Extends the existing (parked) auto-followup feature into an hour-scale,
-- media-rich, per-channel drip:
--   * chatbots.auto_followup_steps   = ordered drip steps (JSONB array). Each:
--        { "delay_hours": number, "asset_key": string|null, "text": string|null }
--     The first step re-engages after silence; later steps escalate.
--   * chatbots.auto_followup_loop_last = repeat the final step until the lead is
--     confirmed or the messaging window closes.
--   * chatbots.ai_media_enabled       = let the live AI emit [[SEND_ASSET: key]]
--     directives to send an asset mid-conversation.
--   * followup_assets        f         = per-chatbot library of uploaded media
--     (image/video/audio) + link assets, referenced by `key` from steps and AI
--     directives. Media lives in the PUBLIC `followup-assets` bucket (ManyChat
--     needs a public HTTPS URL to fetch it at send time).
--   * conversations.followup_step_index = which step this contact is on.
--   * conversations.confirmed_at / confirmed_by = lead marked won (manual button
--     or AI auto-detect); confirmed convos are excluded from the drip.
--   * conversations.rn_opt_in_at / rn_topic_id = Recurring Notifications opt-in
--     (Phase 6, multi-day reach past the 24h window).
--
-- Re-runnable: add-column/table-if-not-exists matches the manual one-shot apply.
-- Apply in the Supabase dashboard SQL editor before deploying the feature.

-- ---------------------------------------------------------------------
-- 1. chatbots - sequence + AI-media settings
-- ---------------------------------------------------------------------
alter table public.chatbots
  add column if not exists auto_followup_steps jsonb not null default '[]'::jsonb,  -- ordered drip steps
  add column if not exists auto_followup_loop_last boolean not null default false,  -- repeat final step until confirmed
  add column if not exists ai_media_enabled boolean not null default false;         -- allow [[SEND_ASSET]] directives

-- ---------------------------------------------------------------------
-- 2. conversations - per-contact drip state + confirmation + RN opt-in
-- ---------------------------------------------------------------------
alter table public.conversations
  add column if not exists followup_step_index int not null default 0,   -- next drip step to send
  add column if not exists confirmed_at timestamptz,                     -- lead marked won (stops the drip)
  add column if not exists confirmed_by text,
  add column if not exists rn_opt_in_at timestamptz,                     -- Recurring Notifications opt-in (Phase 6)
  add column if not exists rn_topic_id text;

-- Named drop/re-add so a re-run picks up constraint changes (an inline check on
-- `add column if not exists` is silently skipped once the column exists).
alter table public.conversations drop constraint if exists conversations_confirmed_by_check;
alter table public.conversations add constraint conversations_confirmed_by_check
  check (confirmed_by is null or confirmed_by in ('manual','ai'));

-- ---------------------------------------------------------------------
-- 3. followup_assets - per-chatbot media/link library
-- ---------------------------------------------------------------------
create table if not exists public.followup_assets (
  id           uuid primary key default uuid_generate_v4(),
  chatbot_id   uuid not null references public.chatbots(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  key          text not null,                                            -- short handle used by steps + AI directives
  label        text,                                                     -- human-friendly name
  description  text,                                                     -- what it is / when to send (fed to the AI)
  kind         text not null check (kind in ('image','video','audio','link')),
  storage_path text,                                                     -- path in followup-assets bucket (null for link)
  url          text,                                                     -- public media URL, or external link (kind='link')
  mime         text,
  created_at   timestamptz not null default now(),
  unique (chatbot_id, key)
);
create index if not exists followup_assets_chatbot_idx on public.followup_assets(chatbot_id);

alter table public.followup_assets enable row level security;

drop policy if exists "own followup_assets" on public.followup_assets;
create policy "own followup_assets" on public.followup_assets for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "admin all followup_assets" on public.followup_assets;
create policy "admin all followup_assets" on public.followup_assets for all
  using (public.is_superadmin()) with check (public.is_superadmin());

-- ---------------------------------------------------------------------
-- 4. Public Storage bucket for follow-up media (ManyChat fetches by URL)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('followup-assets', 'followup-assets', true)
  on conflict (id) do nothing;

-- Reads are public (bucket public=true) so ManyChat can fetch the media URL.
-- Writes/updates/deletes are scoped to the owner's own {user_id}/ folder;
-- superadmins may write/update while impersonating a client.
drop policy if exists "own followup asset write" on storage.objects;
create policy "own followup asset write" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'followup-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own followup asset update" on storage.objects;
create policy "own followup asset update" on storage.objects for update to authenticated
  using (
    bucket_id = 'followup-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'followup-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own followup asset delete" on storage.objects;
create policy "own followup asset delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'followup-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "admin followup asset write" on storage.objects;
create policy "admin followup asset write" on storage.objects for insert to authenticated
  with check (bucket_id = 'followup-assets' and public.is_superadmin());

drop policy if exists "admin followup asset update" on storage.objects;
create policy "admin followup asset update" on storage.objects for update to authenticated
  using (bucket_id = 'followup-assets' and public.is_superadmin())
  with check (bucket_id = 'followup-assets' and public.is_superadmin());

-- Teardown (down-migration), if the feature is pulled:
-- drop policy if exists "admin followup asset update" on storage.objects;
-- drop policy if exists "admin followup asset write"  on storage.objects;
-- drop policy if exists "own followup asset delete"   on storage.objects;
-- drop policy if exists "own followup asset update"   on storage.objects;
-- drop policy if exists "own followup asset write"    on storage.objects;
-- delete from storage.buckets where id = 'followup-assets';
-- drop table if exists public.followup_assets;
-- alter table public.conversations
--   drop column if exists followup_step_index, drop column if exists confirmed_at,
--   drop column if exists confirmed_by, drop column if exists rn_opt_in_at, drop column if exists rn_topic_id;
-- alter table public.chatbots
--   drop column if exists auto_followup_steps, drop column if exists auto_followup_loop_last,
--   drop column if exists ai_media_enabled;
