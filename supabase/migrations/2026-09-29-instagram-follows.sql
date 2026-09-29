-- =============================================================================
-- 2026-09-29  New Instagram followers, as ManyChat reports them
-- =============================================================================
--
-- WHY
-- Owners want to see who followed their Instagram account and how many of those
-- people went on to start a conversation. Instagram's public API has no follower
-- list and no follow event, so the source is ManyChat's Follow to DM trigger
-- (the "Say hi to new followers" automation). An External Request step in that
-- automation posts {"event": "new_follower", ...} to /api/webhooks/manychat,
-- which writes one row here per follower (lib/follows.ts). Statistics reads them
-- back through instagram_follow_report.
--
-- Coverage is ManyChat's, not Instagram's: the trigger only fires for people who
-- are not already ManyChat contacts (anyone who has messaged the account, or got
-- a DM from one of its automations such as comment-to-DM, is skipped), fires once
-- per person (no re-follows), and is a Meta beta that not every account has. The
-- Statistics card says so.
--
-- WHO CAN DO WHAT
--   - Read: the bot's CURRENT owner (checked through chatbots, so a transferred
--     bot's followers move with it, and no user_id column needs updating) or a
--     superadmin. Rows are keyed by chatbot, like chatbot_section_versions.
--   - Write: nobody through the API. The webhook writes with the service role.
--   - instagram_follow_report runs as the CALLER (security invoker), so RLS still
--     applies underneath, and it scopes by analytics_scope_uid(p_user_id) exactly
--     like analytics_overview: self, or anyone for a superadmin (View as client),
--     else it raises 42501 before reading a row.
--
-- DEPLOY ORDER
-- Run this BEFORE deploying the app. The app tolerates a missing table (the
-- webhook logs the failed insert and still answers 200 with no message, and the
-- Statistics card stays hidden because the function is missing, PGRST202), but
-- ManyChat reports each follower only once, so every follow that arrives before
-- the table exists is lost for good. Idempotent: re-running it is harmless.
--
-- HOW TO RUN: paste the whole file into the SQL editor and run it once. It is one
-- transaction. Then run the VERIFY queries at the bottom.
-- =============================================================================

begin;

set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------
create table if not exists public.instagram_follows (
  id                      uuid primary key default gen_random_uuid(),
  chatbot_id              uuid not null references public.chatbots(id) on delete cascade,
  manychat_subscriber_id  text not null,                       -- ManyChat's contact id (Full Contact Data "id")
  external_user_id        text,                                -- the identity that survives a ManyChat contact deletion, chosen exactly like conversations.external_user_id (resolveExternalId)
  username                text,                                -- the @handle, when ManyChat sent one
  display_name            text,                                -- first + last name, when ManyChat sent them
  followed_at             timestamptz not null default now(),  -- when the event reached us (the automation can run minutes after the follow)
  constraint instagram_follows_once unique (chatbot_id, manychat_subscriber_id)
);

comment on table public.instagram_follows is
  'New Instagram followers reported by ManyChat''s Follow to DM automation (one row per follower per bot). Written only by /api/webhooks/manychat; see lib/follows.ts.';

-- The report's range scans (per bot, by date), and its first/last-follow probes.
create index if not exists instagram_follows_by_day
  on public.instagram_follows (chatbot_id, followed_at desc);

alter table public.instagram_follows enable row level security;

drop policy if exists "instagram follows: owner reads" on public.instagram_follows;
create policy "instagram follows: owner reads" on public.instagram_follows
  for select to authenticated using (
    exists (select 1 from public.chatbots c
             where c.id = chatbot_id and c.user_id = (select auth.uid()))
  );

drop policy if exists "instagram follows: superadmin reads" on public.instagram_follows;
create policy "instagram follows: superadmin reads" on public.instagram_follows
  for select to authenticated using ( (select public.is_superadmin()) );

-- Supabase's default privileges hand the client roles every table privilege
-- (INSERT, UPDATE, DELETE, TRUNCATE - which RLS does not cover - and on
-- Postgres 17 MAINTAIN). Only signed-in reading is ever needed.
revoke all on table public.instagram_follows from anon, authenticated;
grant select on table public.instagram_follows to authenticated;
grant select, insert, update, delete on table public.instagram_follows to service_role;

-- ---------------------------------------------------------------------------
-- 2. The Statistics report
-- ---------------------------------------------------------------------------
-- One jsonb for the card:
--   tracking           any follow ever recorded for the bots in scope (else: setup prompt)
--   tracked_bots       the bots in scope with at least one recorded follow, each as
--                      {id, first_followed_at, last_followed_at}. A bot was tracked no
--                      later than its first recorded follow, so the card compares with
--                      the previous period only once EVERY tracked bot's first follow
--                      is before it, and names a bot whose first follow falls inside
--                      the range (in "All chatbots" one bot can start long after another)
--   first_followed_at  the first recorded follow in scope (the day series starts there)
--   last_followed_at   the latest recorded follow in scope (a feed that went quiet)
--   follows            follows in [p_from, p_to)
--   prev_follows       follows in [p_prev_from, p_from), or null when p_prev_from is null
--   messaged           of `follows`, how many have a thread with at least one inbound
--                      from them (a DM, or a keyword comment the bot answered), any
--                      time: the automation can run minutes after the follow, and
--                      someone quick can write first. The thread is found by ManyChat
--                      contact id, else by external_user_id, because ManyChat issues
--                      a new contact id when a contact is deleted and recreated.
--   series             one {day, follows} per UTC day, from the later of p_from and
--                      the first recorded follow to the earlier of p_to and today, so
--                      its length is bounded by how long tracking has run, whatever
--                      range the caller asks for (empty when nothing is tracked)
--   latest             the newest p_latest follows in the range (capped at 50)
create or replace function public.instagram_follow_report(
  p_from       timestamptz,
  p_to         timestamptz,
  p_prev_from  timestamptz default null,
  p_chatbot_id uuid default null,
  p_user_id    uuid default null,
  p_latest     integer default 8
)
returns jsonb
language sql
stable
set search_path = ''
as $function$
  with scope as (
    select c.id
    from public.chatbots c
    where c.user_id = (select public.analytics_scope_uid(p_user_id))
      and (p_chatbot_id is null or c.id = p_chatbot_id)
  ),
  tracked as (
    select b.chatbot_id, b.first_at, b.last_at
    from (
      select s.id as chatbot_id,
             (select min(f.followed_at) from public.instagram_follows f where f.chatbot_id = s.id) as first_at,
             (select max(f.followed_at) from public.instagram_follows f where f.chatbot_id = s.id) as last_at
      from scope s
    ) b
    where b.first_at is not null
  ),
  period as (
    select f.chatbot_id, f.manychat_subscriber_id, f.external_user_id,
           f.username, f.display_name, f.followed_at
    from public.instagram_follows f
    where f.chatbot_id in (select s.id from scope s)
      and f.followed_at >= p_from and f.followed_at < p_to
  ),
  flagged as (
    select p.username, p.display_name, p.followed_at,
           cv.id as conversation_id,
           coalesce(cv.messaged, false) as messaged
    from period p
    left join lateral (
      select c.id,
             exists (
               select 1 from public.messages m
               where m.conversation_id = c.id and m.role = 'user'
             ) as messaged
      from public.conversations c
      where c.chatbot_id = p.chatbot_id
        and (c.manychat_subscriber_id = p.manychat_subscriber_id
             or (p.external_user_id is not null and c.external_user_id = p.external_user_id))
      order by messaged desc,
               (c.manychat_subscriber_id = p.manychat_subscriber_id) desc,
               c.last_message_at desc nulls last
      limit 1
    ) cv on true
  ),
  spine as (
    select d::date as day
    from generate_series(
           greatest(date_trunc('day', p_from),
                    date_trunc('day', coalesce((select min(t.first_at) from tracked t), 'infinity'::timestamptz))),
           least(date_trunc('day', p_to - interval '1 second'), date_trunc('day', now())),
           interval '1 day') d
  ),
  by_day as (
    select date_trunc('day', p.followed_at)::date as day, count(*) as n
    from period p
    group by 1
  ),
  series as (
    select to_char(s.day, 'YYYY-MM-DD') as day, coalesce(b.n, 0) as follows
    from spine s
    left join by_day b on b.day = s.day
  ),
  latest as (
    select l.username, l.display_name, l.followed_at, l.conversation_id, l.messaged
    from flagged l
    order by l.followed_at desc
    limit greatest(0, least(coalesce(p_latest, 8), 50))
  )
  select jsonb_build_object(
    'tracking',          exists (select 1 from tracked),
    'tracked_bots',      (select coalesce(jsonb_agg(jsonb_build_object(
                                     'id',                t.chatbot_id,
                                     'first_followed_at', t.first_at,
                                     'last_followed_at',  t.last_at
                                   ) order by t.first_at, t.chatbot_id), '[]'::jsonb)
                          from tracked t),
    'first_followed_at', (select min(t.first_at) from tracked t),
    'last_followed_at',  (select max(t.last_at) from tracked t),
    'follows',           (select count(*) from period),
    'prev_follows',      case when p_prev_from is null then null else (
                           select count(*) from public.instagram_follows f
                           where f.chatbot_id in (select s.id from scope s)
                             and f.followed_at >= p_prev_from and f.followed_at < p_from
                         ) end,
    'messaged',          (select count(*) from flagged where messaged),
    'series',            (select coalesce(jsonb_agg(to_jsonb(series) order by series.day), '[]'::jsonb) from series),
    'latest',            (select coalesce(jsonb_agg(to_jsonb(latest) order by latest.followed_at desc), '[]'::jsonb) from latest)
  );
$function$;

revoke all on function public.instagram_follow_report(timestamptz, timestamptz, timestamptz, uuid, uuid, integer) from public, anon;
grant execute on function public.instagram_follow_report(timestamptz, timestamptz, timestamptz, uuid, uuid, integer) to authenticated, service_role;

-- PostgREST caches the schema; make it see the new table and function now.
notify pgrst, 'reload schema';

commit;


-- =============================================================================
-- VERIFY (run after the migration; all read-only)
-- =============================================================================
-- 1. The table, its RLS and its two read policies:
--   select relrowsecurity from pg_class where oid = 'public.instagram_follows'::regclass;   -- true
--   select policyname, cmd, roles from pg_policies where tablename = 'instagram_follows';  -- 2 rows, SELECT, {authenticated}
-- 2. Client roles can only read:
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_name = 'instagram_follows' and grantee in ('anon','authenticated');     -- authenticated SELECT only
-- 3. The report runs as the caller and anon cannot call it:
--   select prosecdef from pg_proc where proname = 'instagram_follow_report';              -- false
--   select has_function_privilege('anon',
--     'public.instagram_follow_report(timestamptz, timestamptz, timestamptz, uuid, uuid, integer)', 'execute'); -- false
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- FIRST remove the External Request step from every account's "Say hi to new
-- followers" automation in ManyChat (or keep the webhook's follow handling and
-- remove only the Statistics card). An older webhook without that handling reads
-- a follow body as an empty message. Then revert the app, then run:
--   drop function if exists public.instagram_follow_report(timestamptz, timestamptz, timestamptz, uuid, uuid, integer);
--   drop table if exists public.instagram_follows;
