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
