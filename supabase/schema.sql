-- =====================================================================
-- ChatPilot — Supabase schema
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
