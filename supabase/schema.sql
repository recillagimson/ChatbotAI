-- =====================================================================
-- SpeedSettr — Supabase schema
-- Run this in the Supabase SQL Editor (one shot is fine; idempotent-ish).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- profiles: one row per auth user, created on signup via trigger
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  company_name text,
  avatar_url text,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- subscriptions: Stripe subscription state per profile
-- ---------------------------------------------------------------------
create table if not exists public.subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  status text not null default 'incomplete',  -- active|trialing|past_due|canceled|incomplete
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  -- Admin comp grant (see supabase/migrations/2026-07-06-comp-access.sql): a
  -- comp is status='trialing' with comp_expires_at in the future; NULL on real
  -- Stripe subs. Enforced at check time by lib/access.ts hasActiveAccess().
  comp_expires_at timestamptz,
  comp_granted_at timestamptz,
  comp_granted_by uuid references public.profiles(id),
  comp_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);
create index if not exists subscriptions_user_id_idx on public.subscriptions(user_id);

-- ---------------------------------------------------------------------
-- chatbots: one per IG/Messenger page a user connects
-- ---------------------------------------------------------------------
create table if not exists public.chatbots (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  business_description text,
  tone text not null default 'friendly',   -- friendly|professional|casual|enthusiastic
  manychat_page_id text,                   -- ManyChat page identifier
  instagram_username text,
  system_prompt text,                      -- compiled prompt cached for speed
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chatbots_user_id_idx on public.chatbots(user_id);
create index if not exists chatbots_manychat_page_idx on public.chatbots(manychat_page_id);

-- ---------------------------------------------------------------------
-- knowledge_base: docs/FAQ entries a chatbot uses as context
-- ---------------------------------------------------------------------
create table if not exists public.knowledge_base (
  id uuid primary key default uuid_generate_v4(),
  chatbot_id uuid not null references public.chatbots(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  content text not null,
  source_type text not null default 'manual',  -- manual|upload|url
  source_name text,                            -- filename or URL
  created_at timestamptz not null default now()
);
create index if not exists kb_chatbot_idx on public.knowledge_base(chatbot_id);

-- ---------------------------------------------------------------------
-- conversations: one per IG subscriber per chatbot
-- ---------------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default uuid_generate_v4(),
  chatbot_id uuid not null references public.chatbots(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  manychat_subscriber_id text not null,       -- subscriber on ManyChat side
  contact_name text,
  contact_username text,
  status text not null default 'active',      -- active|ai_paused|closed
  last_message_at timestamptz not null default now(),
  unread_count int not null default 0,
  memory_summary text,                        -- rolling summary of turns older than the verbatim window; null until a chat grows past it
  memory_summary_at timestamptz,              -- created_at watermark of the newest message already folded into the summary
  created_at timestamptz not null default now(),
  unique (chatbot_id, manychat_subscriber_id)
);
create index if not exists conversations_chatbot_idx on public.conversations(chatbot_id);
create index if not exists conversations_last_msg_idx on public.conversations(last_message_at desc);

-- ---------------------------------------------------------------------
-- messages: every inbound/outbound message in a conversation
-- ---------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null,            -- user|assistant|human_agent
  content text not null,
  ai_generated boolean not null default false,
  tokens_used int,
  media_url text,                -- inbound attachment: storage path (request-uploads) or URL; null = text only
  media_type text,               -- inbound attachment MIME type (image/jpeg, audio/m4a, ...); null = text only
  created_at timestamptz not null default now()
);
create index if not exists messages_conv_idx on public.messages(conversation_id, created_at);

-- ---------------------------------------------------------------------
-- usage_log: track AI calls for billing/limits
-- ---------------------------------------------------------------------
create table if not exists public.usage_log (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  chatbot_id uuid references public.chatbots(id) on delete set null,
  event_type text not null,      -- ai_reply|kb_upload
  tokens_used int default 0,
  created_at timestamptz not null default now()
);
create index if not exists usage_user_idx on public.usage_log(user_id, created_at desc);

-- ---------------------------------------------------------------------
-- Feature: auto follow-up
--   Per-chatbot settings + per-conversation send state.
--   Re-runnable: add-column-if-not-exists matches the manual one-shot apply.
-- ---------------------------------------------------------------------
alter table public.chatbots
  add column if not exists auto_followup_enabled boolean not null default false,
  add column if not exists auto_followup_days int not null default 3,        -- days of silence before a follow-up (app clamps 1..6)
  add column if not exists auto_followup_repeat boolean not null default false,
  add column if not exists auto_followup_max int not null default 3,         -- max sends when repeat is on (also bounded by IG's 7-day window)
  add column if not exists auto_followup_template text;                      -- message body; supports {{name}}

alter table public.conversations
  add column if not exists last_followup_at timestamptz,
  add column if not exists followup_count int not null default 0;

-- Cron filters on stale active conversations; index supports that scan.
create index if not exists conversations_followup_idx
  on public.conversations(status, last_message_at desc);

-- ---------------------------------------------------------------------
-- Feature: per-chatbot ManyChat credentials
--   Each chatbot stores its own ManyChat API key (encrypted at rest) and a
--   per-chatbot inbound webhook secret. Re-runnable.
-- ---------------------------------------------------------------------
alter table public.chatbots
  add column if not exists manychat_api_key_enc text,            -- AES-256-GCM ciphertext; null => global env fallback
  add column if not exists webhook_secret text not null
      default encode(gen_random_bytes(24), 'hex');              -- per-chatbot inbound auth token (gen_random_bytes from pgcrypto, already enabled)

-- =====================================================================
-- Trigger: auto-create profile on auth signup
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- updated_at auto-touch
-- =====================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

do $$
declare t text;
begin
  for t in select unnest(array['profiles','subscriptions','chatbots']) loop
    execute format('drop trigger if exists touch_%I on public.%I', t, t);
    execute format('create trigger touch_%I before update on public.%I
                    for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- =====================================================================
-- Row Level Security — users only see their own rows
-- =====================================================================
alter table public.profiles       enable row level security;
alter table public.subscriptions  enable row level security;
alter table public.chatbots       enable row level security;
alter table public.knowledge_base enable row level security;
alter table public.conversations  enable row level security;
alter table public.messages       enable row level security;
alter table public.usage_log      enable row level security;

-- profiles
drop policy if exists "own profile read"  on public.profiles;
drop policy if exists "own profile write" on public.profiles;
create policy "own profile read"  on public.profiles for select using (auth.uid() = id);
create policy "own profile write" on public.profiles for update using (auth.uid() = id);

-- subscriptions (read only for owner; server writes via service role)
drop policy if exists "own sub read" on public.subscriptions;
create policy "own sub read" on public.subscriptions for select using (auth.uid() = user_id);

-- chatbots
drop policy if exists "own chatbots" on public.chatbots;
create policy "own chatbots" on public.chatbots for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- knowledge_base
drop policy if exists "own kb" on public.knowledge_base;
create policy "own kb" on public.knowledge_base for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- conversations
drop policy if exists "own conversations" on public.conversations;
create policy "own conversations" on public.conversations for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- messages (via conversation ownership)
drop policy if exists "own messages" on public.messages;
create policy "own messages" on public.messages for all
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );

-- usage_log (read own)
drop policy if exists "own usage" on public.usage_log;
create policy "own usage" on public.usage_log for select using (auth.uid() = user_id);

-- =====================================================================
-- Feature: adaptive KB retrieval (pgvector)
--   Derived kb_chunks index beside knowledge_base. Re-runnable.
-- =====================================================================
create extension if not exists vector;  -- project installs extensions in public (matches uuid-ossp/pgcrypto)

-- Indexing/quality flags on the source entries.
alter table public.knowledge_base
  add column if not exists indexed      boolean not null default false,
  add column if not exists needs_review boolean not null default false;

-- Persisted retrieval mode for hysteresis (avoids flapping near the threshold).
alter table public.chatbots
  add column if not exists retrieval_active boolean not null default false;

-- Derived retrieval index. One knowledge_base entry -> many chunks.
create table if not exists public.kb_chunks (
  id                uuid primary key default uuid_generate_v4(),
  knowledge_base_id uuid not null references public.knowledge_base(id) on delete cascade,
  chatbot_id        uuid not null references public.chatbots(id)       on delete cascade,
  user_id           uuid not null references public.profiles(id)       on delete cascade,
  chunk_index       int  not null,
  content           text not null,
  embedding         vector(1536),          -- text-embedding-3-small (1536-dim)
  embedding_model   text,                  -- e.g. 'text-embedding-3-small'
  created_at        timestamptz not null default now(),
  unique (knowledge_base_id, chunk_index)
);
create index if not exists kb_chunks_chatbot_idx on public.kb_chunks(chatbot_id);
create index if not exists kb_chunks_hnsw_idx
  on public.kb_chunks using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

alter table public.kb_chunks enable row level security;
drop policy if exists "own kb chunks" on public.kb_chunks;
create policy "own kb chunks" on public.kb_chunks for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and chatbot_id in (select id from public.chatbots where user_id = auth.uid())
  );

-- Similarity search RPC. MUST stay SECURITY INVOKER. service_role-only execute.
create or replace function public.match_kb_chunks(
  p_chatbot_id     uuid,
  p_query          vector(1536),
  p_top_k          int   default 8,
  p_min_similarity float default 0.3,
  p_model          text  default 'text-embedding-3-small'
)
returns table (content text, knowledge_base_id uuid, chunk_index int, similarity float)
language sql stable
security invoker
as $$
  select c.content, c.knowledge_base_id, c.chunk_index,
         1 - (c.embedding <=> p_query) as similarity
  from public.kb_chunks c
  where c.chatbot_id = p_chatbot_id
    and c.embedding is not null
    and c.embedding_model = p_model
    and (1 - (c.embedding <=> p_query)) >= p_min_similarity
  order by c.embedding <=> p_query
  limit p_top_k;
$$;

revoke all on function public.match_kb_chunks(uuid, vector, int, float, text)
  from public, anon, authenticated;
grant execute on function public.match_kb_chunks(uuid, vector, int, float, text)
  to service_role;

-- Teardown (down-migration), if the feature is pulled:
-- drop function if exists public.match_kb_chunks(uuid, vector, int, float, text);
-- drop table if exists public.kb_chunks;
-- alter table public.chatbots drop column if exists retrieval_active;
-- alter table public.knowledge_base drop column if exists indexed, drop column if exists needs_review;

-- =====================================================================
-- Feature: superadmin console + change requests + feedback
--   Team-side role flag + cross-tenant RLS overlays keyed on a
--   security-definer privilege helper + two request tables. Re-runnable.
-- =====================================================================

-- 1. Role flag on profiles.
alter table public.profiles add column if not exists is_superadmin boolean not null default false;

-- 2. Privilege helper. SECURITY DEFINER so its own read of profiles bypasses RLS
--    (prevents policy self-recursion when used inside a profiles policy below).
create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_superadmin from public.profiles where id = auth.uid()), false);
$$;
revoke all on function public.is_superadmin() from public, anon;
grant execute on function public.is_superadmin() to authenticated;

-- 3. change_requests: a client's natural-language ask + the Sonnet draft + the team's decision.
create table if not exists public.change_requests (
  id           uuid primary key default uuid_generate_v4(),
  chatbot_id   uuid not null references public.chatbots(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,  -- the CLIENT (owner)
  request_text text not null,
  status       text not null default 'pending'
                 check (status in ('pending','approved','applied','rejected')),
  proposed     jsonb,        -- { system_prompt?: text, kb_entries?: [{title,content}], summary: text }
  model_used   text,
  draft_error  text,         -- set if the auto-draft Sonnet call failed (request still usable)
  final        jsonb,        -- team-edited/selected payload, set at Approve
  admin_note   text,
  reviewed_by  uuid references public.profiles(id),
  reviewed_at  timestamptz,
  applied_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists change_requests_status_idx  on public.change_requests(status, created_at desc);
create index if not exists change_requests_chatbot_idx on public.change_requests(chatbot_id);

drop trigger if exists touch_change_requests on public.change_requests;
create trigger touch_change_requests before update on public.change_requests
  for each row execute function public.touch_updated_at();

-- 4. feedback: a lighter client->team channel.
create table if not exists public.feedback (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  chatbot_id  uuid references public.chatbots(id) on delete set null,   -- optional
  message     text not null,
  status      text not null default 'new' check (status in ('new','read','resolved')),
  admin_note  text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists feedback_status_idx on public.feedback(status, created_at desc);

alter table public.change_requests enable row level security;
alter table public.feedback        enable row level security;

-- 5. RLS — change_requests
drop policy if exists "cr owner insert" on public.change_requests;
create policy "cr owner insert" on public.change_requests for insert
  with check (
    auth.uid() = user_id
    and chatbot_id in (select id from public.chatbots where user_id = auth.uid())
  );

drop policy if exists "cr read" on public.change_requests;
create policy "cr read" on public.change_requests for select
  using (auth.uid() = user_id or public.is_superadmin());

drop policy if exists "cr admin update" on public.change_requests;
create policy "cr admin update" on public.change_requests for update
  using (public.is_superadmin()) with check (public.is_superadmin());

-- 6. RLS — feedback
drop policy if exists "fb owner insert" on public.feedback;
create policy "fb owner insert" on public.feedback for insert
  with check (auth.uid() = user_id);

drop policy if exists "fb read" on public.feedback;
create policy "fb read" on public.feedback for select
  using (auth.uid() = user_id or public.is_superadmin());

drop policy if exists "fb admin update" on public.feedback;
create policy "fb admin update" on public.feedback for update
  using (public.is_superadmin()) with check (public.is_superadmin());

-- 7. Admin RLS overlays on existing tables (ADDITIONAL permissive policies; the
--    existing "own …" policies remain, so normal users are unaffected).
drop policy if exists "admin read profiles" on public.profiles;
create policy "admin read profiles" on public.profiles for select using (public.is_superadmin());

drop policy if exists "admin read subscriptions" on public.subscriptions;
create policy "admin read subscriptions" on public.subscriptions for select using (public.is_superadmin());

drop policy if exists "admin all chatbots" on public.chatbots;
create policy "admin all chatbots" on public.chatbots for all
  using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists "admin all kb" on public.knowledge_base;
create policy "admin all kb" on public.knowledge_base for all
  using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists "admin read conversations" on public.conversations;
drop policy if exists "admin all conversations" on public.conversations;
create policy "admin all conversations" on public.conversations for all
  using (public.is_superadmin()) with check (public.is_superadmin());

-- messages has no user_id column (ownership via the conversation); without this
-- overlay an admin "viewing as" a client sees "No messages yet". read+write (write
-- is needed for the human-agent manual-reply insert).
drop policy if exists "admin all messages" on public.messages;
create policy "admin all messages" on public.messages for all
  using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists "admin read usage" on public.usage_log;
create policy "admin read usage" on public.usage_log for select using (public.is_superadmin());

-- Teardown (down-migration), if the feature is pulled:
-- drop policy if exists "admin read usage" on public.usage_log;
-- drop policy if exists "admin all messages" on public.messages;
-- drop policy if exists "admin all conversations" on public.conversations;
-- drop policy if exists "admin all kb" on public.knowledge_base;
-- drop policy if exists "admin all chatbots" on public.chatbots;
-- drop policy if exists "admin read subscriptions" on public.subscriptions;
-- drop policy if exists "admin read profiles" on public.profiles;
-- drop table if exists public.feedback;
-- drop table if exists public.change_requests;
-- drop function if exists public.is_superadmin();
-- alter table public.profiles drop column if exists is_superadmin;

-- =====================================================================
-- Feature: request-changes chat assistant + attachments
--   Multi-turn transcript + 'draft' state on change_requests, feedback
--   attachments, and a private Storage bucket with per-user RLS. Re-runnable.
-- =====================================================================

-- 1. change_requests: chat transcript + 'draft' state + a short title for History labels.
alter table public.change_requests
  add column if not exists transcript jsonb not null default '[]'::jsonb,
  add column if not exists title text;

-- Widen the status check to include 'draft' (the in-progress client chat).
alter table public.change_requests drop constraint if exists change_requests_status_check;
alter table public.change_requests add constraint change_requests_status_check
  check (status in ('draft','pending','approved','applied','rejected'));

-- 2. feedback: attachments (array of { path, name, type, size }).
alter table public.feedback
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- 3. Private Storage bucket for image/file uploads (feedback + request chat).
insert into storage.buckets (id, name, public)
  values ('request-uploads', 'request-uploads', false)
  on conflict (id) do nothing;

-- Per-user folder RLS on storage.objects: a user reads/writes only under their own
-- user_id/ prefix; superadmins read all (for admin review). Served via signed URLs.
drop policy if exists "own upload write"  on storage.objects;
create policy "own upload write" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'request-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own upload read"   on storage.objects;
create policy "own upload read" on storage.objects for select to authenticated
  using (
    bucket_id = 'request-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "admin upload read" on storage.objects;
create policy "admin upload read" on storage.objects for select to authenticated
  using (bucket_id = 'request-uploads' and public.is_superadmin());

-- Teardown (down-migration), if the feature is pulled:
-- drop policy if exists "admin upload read" on storage.objects;
-- drop policy if exists "own upload read"   on storage.objects;
-- drop policy if exists "own upload write"  on storage.objects;
-- delete from storage.buckets where id = 'request-uploads';
-- alter table public.feedback drop column if exists attachments;
-- alter table public.change_requests drop constraint if exists change_requests_status_check;
-- alter table public.change_requests add constraint change_requests_status_check
--   check (status in ('pending','approved','applied','rejected'));
-- alter table public.change_requests drop column if exists transcript, drop column if exists title;

-- =====================================================================
-- Feature: statistics page analytics (read-only, RLS-scoped)
--   Two security-invoker RPCs granted to authenticated. Re-runnable.
-- =====================================================================

-- Aggregated overview for a date range (+ optional chatbot filter).
create or replace function public.analytics_overview(
  p_from       timestamptz,
  p_to         timestamptz,
  p_chatbot_id uuid default null
)
returns jsonb
language sql
stable
security invoker
as $$
  with convs as (
    select c.id, c.status, c.created_at, c.followup_count
    from public.conversations c
    where c.user_id = auth.uid()
      and c.created_at >= p_from and c.created_at < p_to
      and (p_chatbot_id is null or c.chatbot_id = p_chatbot_id)
  ),
  msgflags as (
    select cv.id,
      exists(select 1 from public.messages m where m.conversation_id = cv.id and m.role = 'user')      as has_user,
      exists(select 1 from public.messages m where m.conversation_id = cv.id and m.role = 'assistant') as has_assistant,
      exists(select 1 from public.messages m where m.conversation_id = cv.id and m.role = 'assistant'
             and m.content ~* 'https?://')                                                             as has_link,
      (select count(*)        from public.messages m where m.conversation_id = cv.id)                  as msg_count,
      (select min(m.created_at) from public.messages m where m.conversation_id = cv.id and m.role = 'user')      as first_user,
      (select min(m.created_at) from public.messages m where m.conversation_id = cv.id and m.role = 'assistant') as first_assistant
    from convs cv
  ),
  funnel as (
    select
      (select count(*) from convs)                                          as entry,
      (select count(*) from msgflags where has_user and has_assistant)      as replied,
      (select count(*) from msgflags where has_link)                        as link_sent
  ),
  rt as (
    select
      avg(extract(epoch from (first_assistant - first_user)))                                              as avg_secs,
      percentile_cont(0.5) within group (order by extract(epoch from (first_assistant - first_user)))      as median_secs
    from msgflags
    where first_assistant is not null and first_user is not null and first_assistant >= first_user
  ),
  status_split as (
    select
      count(*) filter (where status = 'active')    as active,
      count(*) filter (where status = 'ai_paused') as ai_paused,
      count(*) filter (where status = 'closed')    as closed
    from convs
  ),
  msgs_agg as (
    select coalesce(sum(msg_count), 0) as total_msgs, count(*) as n from msgflags
  ),
  ai as (
    select
      count(*) filter (where u.event_type = 'ai_reply')                                                       as ai_replies,
      coalesce(sum(u.tokens_used) filter (where u.event_type = 'ai_reply'), 0)                                as tokens,
      count(*) filter (where u.event_type in ('push_failed','no_manychat_api_key','manychat_key_decrypt_failed')) as delivery_failures
    from public.usage_log u
    where u.user_id = auth.uid()
      and u.created_at >= p_from and u.created_at < p_to
      and (p_chatbot_id is null or u.chatbot_id = p_chatbot_id)
  ),
  followups as (
    select
      coalesce(sum(followup_count), 0)            as followups_sent,
      count(*) filter (where followup_count > 0)  as conv_with_followup
    from convs
  ),
  series as (
    select
      to_char(d::date, 'YYYY-MM-DD') as day,
      (select count(*) from convs c where date_trunc('day', c.created_at) = d) as conversations,
      (select count(*) from public.usage_log u
         where u.user_id = auth.uid() and u.event_type = 'ai_reply'
           and date_trunc('day', u.created_at) = d
           and (p_chatbot_id is null or u.chatbot_id = p_chatbot_id)) as ai_replies
    from generate_series(date_trunc('day', p_from),
                         date_trunc('day', p_to - interval '1 second'),
                         interval '1 day') d
  )
  select jsonb_build_object(
    'funnel',        (select to_jsonb(funnel)       from funnel),
    'response_time', (select to_jsonb(rt)           from rt),
    'status_split',  (select to_jsonb(status_split) from status_split),
    'messages',      (select jsonb_build_object('total', total_msgs,
                              'avg_per_convo', case when n > 0 then round(total_msgs::numeric / n, 1) else 0 end)
                       from msgs_agg),
    'usage',         (select to_jsonb(ai)           from ai),
    'followups',     (select to_jsonb(followups)    from followups),
    'series',        (select coalesce(jsonb_agg(to_jsonb(series) order by day), '[]'::jsonb) from series)
  );
$$;

revoke all on function public.analytics_overview(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.analytics_overview(timestamptz, timestamptz, uuid) to authenticated;

-- Paginated conversation list for one funnel stage (called when a stage is expanded).
create or replace function public.analytics_stage_conversations(
  p_stage      text,
  p_from       timestamptz,
  p_to         timestamptz,
  p_chatbot_id uuid default null,
  p_limit      int  default 6,
  p_offset     int  default 0
)
returns table (id uuid, contact_username text, contact_name text, created_at timestamptz, total bigint)
language sql
stable
security invoker
as $$
  with convs as (
    select c.id, c.contact_username, c.contact_name, c.created_at
    from public.conversations c
    where c.user_id = auth.uid()
      and c.created_at >= p_from and c.created_at < p_to
      and (p_chatbot_id is null or c.chatbot_id = p_chatbot_id)
      and case p_stage
        when 'entry'   then true
        when 'replied' then
          exists(select 1 from public.messages m where m.conversation_id = c.id and m.role = 'user')
          and exists(select 1 from public.messages m where m.conversation_id = c.id and m.role = 'assistant')
        when 'link_sent' then
          exists(select 1 from public.messages m where m.conversation_id = c.id and m.role = 'assistant' and m.content ~* 'https?://')
        else false
      end
  )
  select id, contact_username, contact_name, created_at, count(*) over () as total
  from convs
  order by created_at desc
  limit p_limit offset p_offset;
$$;

revoke all on function public.analytics_stage_conversations(text, timestamptz, timestamptz, uuid, int, int) from public, anon;
grant execute on function public.analytics_stage_conversations(text, timestamptz, timestamptz, uuid, int, int) to authenticated;

-- Teardown (down-migration), if the statistics feature is pulled:
-- drop function if exists public.analytics_overview(timestamptz, timestamptz, uuid);
-- drop function if exists public.analytics_stage_conversations(text, timestamptz, timestamptz, uuid, int, int);

-- ===========================================================================
-- Multi-channel support (Instagram + Messenger + WhatsApp + Telegram + TikTok)
-- ===========================================================================
-- Each conversation records which platform it came from (set by the ManyChat
-- webhook from the per-flow `platform` field). Existing rows default to
-- 'instagram' (all there was before). Outbound replies use this to pick the
-- ManyChat content.type; the inbox tabs filter on it.
alter table public.conversations
  add column if not exists platform text not null default 'instagram';   -- instagram|messenger|whatsapp|telegram|tiktok
create index if not exists conversations_platform_idx
  on public.conversations (chatbot_id, platform, last_message_at desc);

-- Teardown:
-- drop index if exists public.conversations_platform_idx;
-- alter table public.conversations drop column if exists platform;

-- ===========================================================================
-- Three-section prompt authoring + category-aware Request Change
-- ===========================================================================
-- A chatbot's behavior is authored as three independent, editable sections.
-- buildSystemPrompt (lib/anthropic.ts) assembles them (persona leads as
-- identity, then offers, then rebuttals, then KB + guardrails) and falls back
-- to the legacy system_prompt / business_description+tone path only when all
-- three sections are empty. system_prompt / business_description / tone are
-- kept for that fallback and for in-flight legacy change requests.
alter table public.chatbots
  add column if not exists persona_section    text,  -- 1. personality / tone (leads as identity)
  add column if not exists offers_section     text,  -- 2. offers & services / inclusions & exclusions / links
  add column if not exists rebuttals_section  text;  -- 3. rebuttals, FAQs

-- One-time backfill: seed Personality from the existing hand-crafted prompt so
-- persona bots keep their voice. Idempotent (only when the section is empty).
update public.chatbots
   set persona_section = coalesce(nullif(trim(system_prompt), ''),
                                  nullif(trim(business_description), ''))
 where persona_section is null
   and coalesce(nullif(trim(system_prompt), ''), nullif(trim(business_description), '')) is not null;

-- Request Change category: which section a request targets (or 'other' = KB/misc).
-- Personality auto-applies (client, no admin); offers/rebuttals/other need approval.
alter table public.change_requests
  add column if not exists category text not null default 'other'
    check (category in ('personality','offers','rebuttals','other'));
create index if not exists change_requests_category_idx
  on public.change_requests (category, status, created_at desc);

-- Teardown:
-- drop index if exists public.change_requests_category_idx;
-- alter table public.change_requests drop column if exists category;
-- alter table public.chatbots drop column if exists persona_section, drop column if exists offers_section, drop column if exists rebuttals_section;

-- ===========================================================================
-- Admin "View as client" impersonation — superadmin storage write
-- ===========================================================================
-- While a superadmin is "viewing as" a client, uploads (KB upload, request-chat
-- attachments) are written under the CLIENT's {user_id}/ folder, but the admin's
-- real auth.uid() is the admin — so the owner-only "own upload write" INSERT
-- policy would reject it. Mirror the existing "admin upload read" with a
-- superadmin INSERT (and UPDATE, for upserts) policy so impersonated uploads
-- land under the client's folder. (No new columns; RLS only.)
drop policy if exists "admin upload write" on storage.objects;
create policy "admin upload write" on storage.objects for insert to authenticated
  with check (bucket_id = 'request-uploads' and public.is_superadmin());

drop policy if exists "admin upload update" on storage.objects;
create policy "admin upload update" on storage.objects for update to authenticated
  using (bucket_id = 'request-uploads' and public.is_superadmin())
  with check (bucket_id = 'request-uploads' and public.is_superadmin());

-- Teardown:
-- drop policy if exists "admin upload write"  on storage.objects;
-- drop policy if exists "admin upload update" on storage.objects;

-- ===========================================================================
-- Rich-media auto follow-up system
-- ===========================================================================
-- Hour-scale, media-rich, per-channel drip on top of the (parked) day-scale
-- auto-followup. Steps live on chatbots.auto_followup_steps (ordered JSONB);
-- media/link assets live in the followup_assets library + PUBLIC followup-assets
-- bucket (ManyChat needs a public HTTPS URL). Per-contact drip state, lead
-- confirmation, and Recurring-Notifications opt-in live on conversations.
alter table public.chatbots
  add column if not exists auto_followup_steps jsonb not null default '[]'::jsonb,  -- ordered drip steps: [{delay_hours, asset_keys?: string[] (legacy asset_key? still read), text?, flow_ns?/flow_name? (Instagram/default voice flow), flow_ns_fb?/flow_name_fb? (Facebook voice flow), ai_generate?: boolean (AI writes the message; text becomes optional guidance)}]
  add column if not exists auto_followup_loop_last boolean not null default false,  -- legacy; superseded by auto_followup_loop_mode (see 2026-07-07-followup-loop-mode.sql)
  add column if not exists auto_followup_loop_mode text not null default 'stop',    -- after last step: stop | repeat last | cycle through all
  add column if not exists ai_media_enabled boolean not null default false;         -- allow [[SEND_ASSET]] directives from the live AI

-- Named drop/re-add so a re-run picks up constraint changes (an inline check on
-- `add column if not exists` is silently skipped once the column exists).
alter table public.chatbots drop constraint if exists chatbots_auto_followup_loop_mode_check;
alter table public.chatbots add constraint chatbots_auto_followup_loop_mode_check
  check (auto_followup_loop_mode in ('stop', 'repeat_last', 'cycle'));

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

-- Inbox bucket auto-set by the tag classifier + manual override (2026-07-10-conversation-tag.sql).
-- `starting_later` + start_on/start_note added by 2026-07-13-starting-later.sql (pauses the drip).
alter table public.conversations
  add column if not exists tag text not null default 'lead',  -- lead | wants_call | starting_later | needs_human | subscribed
  add column if not exists start_on date,                     -- starting_later: date they want to begin
  add column if not exists start_note text;                   -- starting_later: the human phrase
alter table public.conversations drop constraint if exists conversations_tag_check;
alter table public.conversations add constraint conversations_tag_check
  check (tag in ('lead','wants_call','starting_later','needs_human','subscribed','disqualified','bot'));
-- Existing confirmed customers are subscribers.
update public.conversations set tag = 'subscribed' where confirmed_at is not null and tag = 'lead';
create index if not exists conversations_tag_idx on public.conversations (user_id, tag);

create table if not exists public.followup_assets (
  id           uuid primary key default uuid_generate_v4(),
  chatbot_id   uuid not null references public.chatbots(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  key          text not null,                                            -- short handle used by steps + AI directives
  label        text,
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

insert into storage.buckets (id, name, public)
  values ('followup-assets', 'followup-assets', true)
  on conflict (id) do nothing;

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

-- Teardown:
-- drop table if exists public.followup_assets;
-- delete from storage.buckets where id = 'followup-assets';
-- (plus the followup-assets storage.objects policies above)

-- ---------------------------------------------------------------------------
-- Reply debounce / single-flight claim (2026-07-02)
-- The webhook waits REPLY_DEBOUNCE_MS (default 5s) after an inbound message so
-- a rapid burst gets ONE consolidated reply. reply_claimed_for = inbound
-- message id of the newest AI-bound webhook run: each run OVERWRITES it before
-- sleeping; a conditional release (set null where reply_claimed_for = <my id>)
-- after generation decides the single run allowed to persist + send.
-- Transient coordination state: no FK, no index, stale value harmless.
-- ---------------------------------------------------------------------------
alter table public.conversations
  add column if not exists reply_claimed_for uuid;

-- ===========================================================================
-- Keyword triggers (2026-07-03)
-- ===========================================================================
-- Per-chatbot keyword auto-reply with first-touch dedup. chatbots.keyword_triggers
-- is an ordered JSONB array of groups: [{id, keywords[], exclude[],
-- first_reply_text, first_reply_asset_key?, on_repeat: "ai"|"message"|"instruction",
-- repeat_text?, instruction?, enabled}]. The webhook matches an inbound DM's text
-- (case-insensitive whole-word contains; ANY include AND NO exclude); the FIRST
-- match for a contact sends that group's canned reply (text + optional followup
-- asset) and records the group id on conversations.keyword_fired; later matches run
-- the group's on_repeat action. keyword_fired is best-effort per-contact state
-- (a lost update just re-sends a canned reply once; never strands the contact).
alter table public.chatbots
  add column if not exists keyword_triggers jsonb not null default '[]'::jsonb,
  add column if not exists training_pairs jsonb not null default '[]'::jsonb;   -- Bot Trainer scenario corrections: [{id, scenario, reply, bad_reply?, exact?, note?, enabled}]

alter table public.conversations
  add column if not exists keyword_fired jsonb not null default '[]'::jsonb;

-- Teardown:
-- alter table public.chatbots     drop column if exists keyword_triggers;
-- alter table public.conversations drop column if exists keyword_fired;

-- ===========================================================================
-- Prompt shield: anti-extraction flagging (2026-07-06)
-- ===========================================================================
-- Owner-visibility state for the anti-prompt-extraction defense. The webhook
-- (step 6b-shield) increments extraction_attempts and stamps flagged_at on
-- every detected extraction/reverse-engineering attempt (lib/extraction-detect.ts);
-- the dashboard renders a red "Flagged" badge when extraction_attempts > 0.
-- Best-effort writes + default-0 reads keep the app fail-open either side of
-- this migration.
alter table public.conversations
  add column if not exists extraction_attempts int not null default 0,
  add column if not exists flagged_at timestamptz;

-- Teardown:
-- alter table public.conversations drop column if exists extraction_attempts;
-- alter table public.conversations drop column if exists flagged_at;

-- ===========================================================================
-- Self-service pause/resume (2026-07-06)
-- ===========================================================================
-- A lead silences the AI for their own conversation by texting "stopmessage"
-- and turns it back on with "resumemessage" (lib/user-controls.ts; webhook gate
-- 6-mute). user_muted_at (null = not muted) is INDEPENDENT of the owner's
-- human-takeover (status='ai_paused'), so a lead can't resume a chat a human
-- agent has taken over. Fail-open: missing column reads as not muted.
alter table public.conversations
  add column if not exists user_muted_at timestamptz;

-- Teardown:
-- alter table public.conversations drop column if exists user_muted_at;

-- ===========================================================================
-- ManyChat BOT_OFF tag sync (2026-07-16)
-- ===========================================================================
-- Per-conversation ManyChat BOT_OFF sync. Set/cleared by the webhook from a
-- bot_off flag (posted by the owner's BOT_OFF tag automation). While set, the bot
-- is fully silent for this subscriber (webhook 6-bot-off gate + follow-up cron skip).
-- Null = bot on. Fail-open on webhook reads; the cron filter is fail-closed.
alter table public.conversations
  add column if not exists bot_off_at timestamptz;

-- Teardown:
-- alter table public.conversations drop column if exists bot_off_at;

-- ===========================================================================
-- ManyChat BOT_ON tag sync (2026-07-17)
-- ===========================================================================
-- Per-conversation manual override, the inverse of BOT_OFF. Set by the webhook from
-- a bot_on flag (the owner's BOT_ON tag automation). While set, the contact is treated
-- as "engaged" so the keyword-only gate (keyword_gate_enabled) is bypassed and the bot
-- replies to them regardless of whether their message matches a keyword. Null = no
-- override (normal keyword-gate behavior). Fail-open on webhook reads.
alter table public.conversations
  add column if not exists bot_forced_on_at timestamptz;

-- Teardown:
-- alter table public.conversations drop column if exists bot_forced_on_at;

-- ===========================================================================
-- Lead tagging via webhook (2026-07-07)
-- ===========================================================================
-- `is_leads: 1` on the ManyChat webhook silently tags a contact as an engaged
-- lead (no reply) — an IG commenter routed here by a ManyChat keyword. is_lead is
-- treated as "engaged" by the keyword gate (webhook 6-gate) so the lead's LATER
-- DMs get bot replies. The bot doesn't proactively reach out (keyword_fired stays
-- empty → the gated follow-up cron skips it). Fail-open: missing column = not a lead.
alter table public.conversations
  add column if not exists is_lead boolean not null default false;

-- Teardown:
-- alter table public.conversations drop column if exists is_lead;

-- ===========================================================================
-- Keyword-only reply mode (2026-07-06)
-- ===========================================================================
-- Per-chatbot toggle: when ON, the AI answers ONLY DMs that match a keyword
-- group (chatbots.keyword_triggers) and silently ignores everything else, for
-- personal/private accounts. Enforced in the webhook (gate 6-gate). Default
-- false; fail-open (missing column = gate off).
alter table public.chatbots
  add column if not exists keyword_gate_enabled boolean not null default false;

-- Teardown:
-- alter table public.chatbots drop column if exists keyword_gate_enabled;

-- ===========================================================================
-- Per-chatbot toggle: keyword match requires the WHOLE message to equal a keyword
-- (strict), instead of the default whole-word "contains". Enforced in the webhook
-- (gate 6-gate). Default false; fail-open (missing column = contains-match).
alter table public.chatbots
  add column if not exists keyword_strict_enabled boolean not null default false;

-- Teardown:
-- alter table public.chatbots drop column if exists keyword_strict_enabled;

-- ===========================================================================
-- ManyChat stop-follow-up flag bridge (2026-07-15)
-- ===========================================================================
-- Per-chatbot opt-in for the ManyChat "stop follow-up" flag feature. When true,
-- SpeedSettr adds/removes the ManyChat tag `ss_no_followup` on a subscriber as
-- the conversation enters/leaves a stop-follow-up state, so a native ManyChat
-- voice-note drip can Condition-exit on it. Default false: no writes to a
-- tenant that hasn't set up the voice flow + tag in ManyChat.
alter table public.chatbots
  add column if not exists followup_flag_enabled boolean not null default false;

-- Teardown:
-- alter table public.chatbots drop column if exists followup_flag_enabled;

-- ===========================================================================
-- SpeedSettr first-message greeting flow (2026-07-15)
-- ===========================================================================
-- SpeedSettr owns the first-message greeting decision. When welcome_enabled and a
-- welcome_flow_ns is set, a brand-new contact whose opener is a bare greeting or one
-- of welcome_keywords (and carries no media) triggers the native ManyChat Welcome VM
-- flow instead of the AI; a substantive opener (image/detail) goes to the AI.
-- conversations.welcomed_at marks the decision as made (VM sent OR first msg -> AI) so
-- the greeting is never re-sent. Default off: an un-set-up bot behaves exactly as today.
alter table public.chatbots
  add column if not exists welcome_enabled boolean not null default false,
  add column if not exists welcome_flow_ns text,
  add column if not exists welcome_flow_name text,
  add column if not exists welcome_keywords jsonb not null default '[]'::jsonb,
  -- ON = the Welcome VM also fires when a new contact's opener matches the chatbot's
  -- Keywords-tab triggers (keyword_triggers), so the owner keeps ONE keyword list.
  add column if not exists welcome_use_keyword_triggers boolean not null default false;

-- welcomed_at is created + backfilled together, inside one guard, so the backfill
-- happens ONLY when the column is first added. Every conversation that predates this
-- column is an EXISTING contact, not a new one — mark it resolved so it can never be
-- mistaken for a brand-new contact. (A plain unconditional backfill would wrongly
-- resolve genuinely-new contacts if the migration were ever re-run.)
-- NOTE: this covers only rows predating the column. This migration runs at deploy while
-- welcome_enabled is still false for every bot, so conversations created between deploy
-- and the day a tenant flips the switch would also read NULL. That second seam is closed
-- at the ENABLE transition in components/dashboard/welcome-form.tsx, which backfills the
-- bot's remaining NULL rows before setting welcome_enabled = true. Both are required for
-- welcomed_at IS NULL to reliably mean "brand new".
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conversations'
      and column_name = 'welcomed_at'
  ) then
    alter table public.conversations add column welcomed_at timestamptz;
    update public.conversations set welcomed_at = now();
  end if;
end $$;

-- Teardown:
-- alter table public.chatbots     drop column if exists welcome_enabled;
-- alter table public.chatbots     drop column if exists welcome_flow_ns;
-- alter table public.chatbots     drop column if exists welcome_flow_name;
-- alter table public.chatbots     drop column if exists welcome_keywords;
-- alter table public.chatbots     drop column if exists welcome_use_keyword_triggers;
-- alter table public.conversations drop column if exists welcomed_at;
