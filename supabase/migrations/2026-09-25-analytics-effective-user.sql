-- =============================================================================
-- 2026-09-25  Analytics report for the EFFECTIVE user ("View as client" fix)
-- =============================================================================
--
-- WHAT IS BROKEN TODAY (verified on prod 2026-09-25, read-only)
--
-- analytics_overview and analytics_stage_conversations scope every row by
-- auth.uid(), the user whose JWT made the request. The dashboard, however,
-- shows the EFFECTIVE user, which differs from the JWT user under "View as
-- client": the superadmin's JWT calls the RPC, so the report is the
-- SUPERADMIN'S OWN ACCOUNT, not the client's. Same 30-day range:
--     as the superadmin ....... 2,154 conversations
--     as the largest client ...   439 conversations  <- what should show
-- A bot-scoped report shows all zeros (the superadmin owns no such rows), and
-- the stage drill-down and its CSV list the superadmin's own contacts.
--
-- Affected surfaces, all under "View as client": /statistics, the statistics
-- CSV export (whole-period and per-stage), the stage drill-down, the
-- /dashboard speed-to-lead hero, the /learn delivery-failures signal, and a
-- bot's Overview tab (/chatbots/[id]?tab=overview). The /admin per-bot page is
-- NOT affected: it never renders the Overview tab.
--
-- SUPERSEDES the analytics definitions in 2026-09-24-analytics-overview-
-- rewrite.sql and supabase/schema.sql. Do NOT re-run either of those (or the
-- 09-24 ROLLBACK block) after this: they CREATE OR REPLACE the old 3-argument
-- signature, which would add a SECOND overload next to this one, and every
-- 3-argument call would then fail as ambiguous (PGRST203). To change a body
-- later, edit THIS signature.
--
-- THE FIX
--
-- Both functions gain a trailing  p_user_id uuid default null  and scope by
-- public.analytics_scope_uid(p_user_id) instead of auth.uid(). The helper:
--   - returns auth.uid() when p_user_id is null or equals auth.uid()  (self)
--   - returns p_user_id only when the caller is a superadmin
--   - otherwise RAISES 42501
--
-- WHY A NON-SUPERADMIN CAN NEVER READ ANOTHER TENANT'S REPORT - three layers:
--   1. The guard raises before any row is read. It is evaluated as an InitPlan
--      (it sits in the index condition), so it fires even on an empty range.
--   2. Both functions stay SECURITY INVOKER, so RLS still applies underneath:
--      a client querying another tenant's user_id sees zero rows regardless.
--   3. is_superadmin() reads profiles.is_superadmin for the JWT user, and the
--      guard_profile_superadmin trigger stops anyone setting that on themselves.
--
-- WHY DROP + CREATE, NOT CREATE OR REPLACE
-- Adding a parameter changes the signature, so CREATE OR REPLACE would leave
-- the old 3-arg function alongside the new 4-arg one, and PostgREST would fail
-- every call with PGRST203 (ambiguous overload). DROP discards the grants, so
-- they are restated below to match today's: authenticated + service_role only.
--
-- DEPLOY ORDER - THIS MIGRATION FIRST, THEN THE APP
-- The currently deployed app keeps working after this runs: it passes three
-- named args, and p_user_id defaults to null, which means "self" - identical
-- to today. The new app passes p_user_id; if it shipped BEFORE this migration,
-- PostgREST would reject the unknown argument (PGRST202) and every analytics
-- panel would show "not installed" until this landed.
-- Rolling back is the REVERSE: revert the app first, then run ROLLBACK below.
--
-- The two function bodies are copied from production, not retyped: the
-- generator checked both against the live bodies before making the
-- substitutions. The live bodies are stored with Windows (CRLF) line endings,
-- so the check compares after normalising them to LF:
--   md5(replace(prosrc, E'\r', ''))   overview 2ea685b4...   stage 974b2a5c...
-- (A raw md5(prosrc) gives 8b26d4dc... / 698c3305...; same content, different
-- line endings.) The ONLY changes to either body are auth.uid() ->
-- analytics_scope_uid(p_user_id), three times in overview and once in stage.
--
-- HOW TO RUN: paste the whole file into the SQL editor and run it once. It is
-- one transaction with no CONCURRENTLY, so running it as a single block is
-- correct. Then run the VERIFY queries at the bottom.
-- =============================================================================

begin;

set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- ---------------------------------------------------------------------------
-- 1. The guard
-- ---------------------------------------------------------------------------
create or replace function public.analytics_scope_uid(p_user_id uuid)
returns uuid
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'analytics: not authenticated' using errcode = '42501';
  end if;
  if p_user_id is null or p_user_id = v_uid then
    return v_uid;
  end if;
  if public.is_superadmin() then
    return p_user_id;
  end if;
  raise exception 'analytics: cannot report on another account' using errcode = '42501';
end;
$function$;

revoke all on function public.analytics_scope_uid(uuid) from public, anon;
grant execute on function public.analytics_scope_uid(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. analytics_overview (+ p_user_id)
-- ---------------------------------------------------------------------------
drop function public.analytics_overview(timestamptz, timestamptz, uuid);

create function public.analytics_overview(
  p_from timestamptz,
  p_to timestamptz,
  p_chatbot_id uuid default null,
  p_user_id uuid default null
)
returns jsonb
language sql
stable
as $function$
  with convs as (
    select c.id, c.status, c.created_at, c.followup_count
    from public.conversations c
    where c.user_id = (select public.analytics_scope_uid(p_user_id))
      and c.created_at >= p_from and c.created_at < p_to
      and (p_chatbot_id is null or c.chatbot_id = p_chatbot_id)
  ),
  -- ONE grouped pass over messages, replacing six correlated subqueries per row.
  -- Deliberately not date-bounded; see the header note.
  magg as (
    select m.conversation_id,
      bool_or(m.role = 'user')                                     as has_user,
      bool_or(m.role = 'assistant')                                as has_assistant,
      bool_or(m.role = 'assistant' and m.content ~* 'https?://')    as has_link,
      count(*)                                                     as msg_count,
      min(m.created_at) filter (where m.role = 'user')             as first_user,
      min(m.created_at) filter (where m.role = 'assistant')        as first_assistant
    from public.messages m
    where m.conversation_id in (select id from convs)
    group by m.conversation_id
  ),
  -- LEFT JOIN so a conversation with zero messages still yields a row, matching
  -- the old subqueries: exists() gave false and count() gave 0, not NULL.
  msgflags as (
    select cv.id,
      coalesce(a.has_user, false)      as has_user,
      coalesce(a.has_assistant, false) as has_assistant,
      coalesce(a.has_link, false)      as has_link,
      coalesce(a.msg_count, 0)         as msg_count,
      a.first_user,
      a.first_assistant
    from convs cv
    left join magg a on a.conversation_id = cv.id
  ),
  funnel as (
    select
      (select count(*) from convs)                                     as entry,
      (select count(*) from msgflags where has_user and has_assistant) as replied,
      (select count(*) from msgflags where has_link)                   as link_sent
  ),
  rt as (
    select
      avg(extract(epoch from (first_assistant - first_user)))                                           as avg_secs,
      percentile_cont(0.5) within group (order by extract(epoch from (first_assistant - first_user)))   as median_secs
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
      count(*) filter (where u.event_type = 'ai_reply')                                                           as ai_replies,
      coalesce(sum(u.tokens_used) filter (where u.event_type = 'ai_reply'), 0)                                    as tokens,
      count(*) filter (where u.event_type in ('push_failed','no_manychat_api_key','manychat_key_decrypt_failed')) as delivery_failures
    from public.usage_log u
    where u.user_id = (select public.analytics_scope_uid(p_user_id))
      and u.created_at >= p_from and u.created_at < p_to
      and (p_chatbot_id is null or u.chatbot_id = p_chatbot_id)
  ),
  followups as (
    select
      coalesce(sum(followup_count), 0)           as followups_sent,
      count(*) filter (where followup_count > 0) as conv_with_followup
    from convs
  ),
  -- The day spine, unchanged in meaning from the old generate_series.
  spine as (
    select d::date as day
    from generate_series(date_trunc('day', p_from),
                         date_trunc('day', p_to - interval '1 second'),
                         interval '1 day') d
  ),
  conv_by_day as (
    select date_trunc('day', c.created_at)::date as day, count(*) as n
    from convs c group by 1
  ),
  -- ONE grouped, RANGE-BOUNDED pass, replacing a full usage_log scan per day.
  -- Bounded by the SPINE's range, not p_from/p_to; see the header note.
  rep_by_day as (
    select date_trunc('day', u.created_at)::date as day, count(*) as n
    from public.usage_log u
    where u.user_id = (select public.analytics_scope_uid(p_user_id))
      and u.event_type = 'ai_reply'
      and u.created_at >= date_trunc('day', p_from)
      and u.created_at <  date_trunc('day', p_to - interval '1 second') + interval '1 day'
      and (p_chatbot_id is null or u.chatbot_id = p_chatbot_id)
    group by 1
  ),
  series as (
    select
      to_char(s.day, 'YYYY-MM-DD') as day,
      coalesce(cd.n, 0)            as conversations,
      coalesce(rd.n, 0)            as ai_replies
    from spine s
    left join conv_by_day cd on cd.day = s.day
    left join rep_by_day  rd on rd.day = s.day
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
$function$;

revoke all on function public.analytics_overview(timestamptz, timestamptz, uuid, uuid) from public, anon;
grant execute on function public.analytics_overview(timestamptz, timestamptz, uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. analytics_stage_conversations (+ p_user_id)
-- ---------------------------------------------------------------------------
drop function public.analytics_stage_conversations(text, timestamptz, timestamptz, uuid, integer, integer);

create function public.analytics_stage_conversations(
  p_stage text,
  p_from timestamptz,
  p_to timestamptz,
  p_chatbot_id uuid default null,
  p_limit integer default 6,
  p_offset integer default 0,
  p_user_id uuid default null
)
returns table(id uuid, contact_username text, contact_name text, created_at timestamptz, total bigint)
language sql
stable
as $function$
  with convs as (
    select c.id, c.contact_username, c.contact_name, c.created_at
    from public.conversations c
    where c.user_id = (select public.analytics_scope_uid(p_user_id))
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
$function$;

revoke all on function public.analytics_stage_conversations(text, timestamptz, timestamptz, uuid, integer, integer, uuid) from public, anon;
grant execute on function public.analytics_stage_conversations(text, timestamptz, timestamptz, uuid, integer, integer, uuid) to authenticated, service_role;

-- PostgREST caches the schema; make it see the new signatures now.
notify pgrst, 'reload schema';

commit;


-- =============================================================================
-- VERIFY (run after the migration; all read-only)
-- =============================================================================
--
-- V1. Exactly one signature of each, with the new trailing parameter. Expect 2 rows.
-- select p.oid::regprocedure, p.prosecdef
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public'
--    and p.proname in ('analytics_overview', 'analytics_stage_conversations');
--
-- V2. Grants: authenticated and service_role true, anon false, on all three.
-- select p.oid::regprocedure,
--        has_function_privilege('anon', p.oid, 'execute')          as anon,
--        has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
--        has_function_privilege('service_role', p.oid, 'execute')  as service_role
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public'
--    and p.proname in ('analytics_overview', 'analytics_stage_conversations', 'analytics_scope_uid');
--
-- V3. The fix works. Run BOTH calls in ONE repeatable-read transaction so they
--     see the same snapshot; messages keep arriving on live threads, so two
--     separate transactions can legitimately differ. Replace the two uuids.
--     Expect same_report = true.
-- begin isolation level repeatable read;
-- set local role authenticated;
-- set local request.jwt.claims = '{"sub":"<SUPERADMIN_UUID>","role":"authenticated"}';
-- create temp table _as_admin on commit drop as
--   select public.analytics_overview(now() - interval '30 days', now(), null, '<CLIENT_UUID>') as r;
-- set local request.jwt.claims = '{"sub":"<CLIENT_UUID>","role":"authenticated"}';
-- select (select r from _as_admin) = public.analytics_overview(now() - interval '30 days', now(), null, null) as same_report;
-- rollback;
--
-- V4. The guard holds: a CLIENT asking for ANOTHER account must fail with
--     42501 "cannot report on another account", even on an empty future range.
-- begin;
-- set local role authenticated;
-- set local request.jwt.claims = '{"sub":"<CLIENT_UUID>","role":"authenticated"}';
-- select public.analytics_overview(now() + interval '1 day', now() + interval '2 days', null, '<SUPERADMIN_UUID>');
-- rollback;


-- =============================================================================
-- ROLLBACK  (revert the APP first, then run this; it restores today's exact
-- functions and grants)
-- =============================================================================
-- begin;
-- drop function public.analytics_overview(timestamptz, timestamptz, uuid, uuid);
-- drop function public.analytics_stage_conversations(text, timestamptz, timestamptz, uuid, integer, integer, uuid);
-- drop function public.analytics_scope_uid(uuid);
--
-- create function public.analytics_overview(
--   p_from timestamptz,
--   p_to timestamptz,
--   p_chatbot_id uuid default null
-- )
-- returns jsonb
-- language sql
-- stable
-- as $function$
--   with convs as (
--     select c.id, c.status, c.created_at, c.followup_count
--     from public.conversations c
--     where c.user_id = (select auth.uid())
--       and c.created_at >= p_from and c.created_at < p_to
--       and (p_chatbot_id is null or c.chatbot_id = p_chatbot_id)
--   ),
--   -- ONE grouped pass over messages, replacing six correlated subqueries per row.
--   -- Deliberately not date-bounded; see the header note.
--   magg as (
--     select m.conversation_id,
--       bool_or(m.role = 'user')                                     as has_user,
--       bool_or(m.role = 'assistant')                                as has_assistant,
--       bool_or(m.role = 'assistant' and m.content ~* 'https?://')    as has_link,
--       count(*)                                                     as msg_count,
--       min(m.created_at) filter (where m.role = 'user')             as first_user,
--       min(m.created_at) filter (where m.role = 'assistant')        as first_assistant
--     from public.messages m
--     where m.conversation_id in (select id from convs)
--     group by m.conversation_id
--   ),
--   -- LEFT JOIN so a conversation with zero messages still yields a row, matching
--   -- the old subqueries: exists() gave false and count() gave 0, not NULL.
--   msgflags as (
--     select cv.id,
--       coalesce(a.has_user, false)      as has_user,
--       coalesce(a.has_assistant, false) as has_assistant,
--       coalesce(a.has_link, false)      as has_link,
--       coalesce(a.msg_count, 0)         as msg_count,
--       a.first_user,
--       a.first_assistant
--     from convs cv
--     left join magg a on a.conversation_id = cv.id
--   ),
--   funnel as (
--     select
--       (select count(*) from convs)                                     as entry,
--       (select count(*) from msgflags where has_user and has_assistant) as replied,
--       (select count(*) from msgflags where has_link)                   as link_sent
--   ),
--   rt as (
--     select
--       avg(extract(epoch from (first_assistant - first_user)))                                           as avg_secs,
--       percentile_cont(0.5) within group (order by extract(epoch from (first_assistant - first_user)))   as median_secs
--     from msgflags
--     where first_assistant is not null and first_user is not null and first_assistant >= first_user
--   ),
--   status_split as (
--     select
--       count(*) filter (where status = 'active')    as active,
--       count(*) filter (where status = 'ai_paused') as ai_paused,
--       count(*) filter (where status = 'closed')    as closed
--     from convs
--   ),
--   msgs_agg as (
--     select coalesce(sum(msg_count), 0) as total_msgs, count(*) as n from msgflags
--   ),
--   ai as (
--     select
--       count(*) filter (where u.event_type = 'ai_reply')                                                           as ai_replies,
--       coalesce(sum(u.tokens_used) filter (where u.event_type = 'ai_reply'), 0)                                    as tokens,
--       count(*) filter (where u.event_type in ('push_failed','no_manychat_api_key','manychat_key_decrypt_failed')) as delivery_failures
--     from public.usage_log u
--     where u.user_id = (select auth.uid())
--       and u.created_at >= p_from and u.created_at < p_to
--       and (p_chatbot_id is null or u.chatbot_id = p_chatbot_id)
--   ),
--   followups as (
--     select
--       coalesce(sum(followup_count), 0)           as followups_sent,
--       count(*) filter (where followup_count > 0) as conv_with_followup
--     from convs
--   ),
--   -- The day spine, unchanged in meaning from the old generate_series.
--   spine as (
--     select d::date as day
--     from generate_series(date_trunc('day', p_from),
--                          date_trunc('day', p_to - interval '1 second'),
--                          interval '1 day') d
--   ),
--   conv_by_day as (
--     select date_trunc('day', c.created_at)::date as day, count(*) as n
--     from convs c group by 1
--   ),
--   -- ONE grouped, RANGE-BOUNDED pass, replacing a full usage_log scan per day.
--   -- Bounded by the SPINE's range, not p_from/p_to; see the header note.
--   rep_by_day as (
--     select date_trunc('day', u.created_at)::date as day, count(*) as n
--     from public.usage_log u
--     where u.user_id = (select auth.uid())
--       and u.event_type = 'ai_reply'
--       and u.created_at >= date_trunc('day', p_from)
--       and u.created_at <  date_trunc('day', p_to - interval '1 second') + interval '1 day'
--       and (p_chatbot_id is null or u.chatbot_id = p_chatbot_id)
--     group by 1
--   ),
--   series as (
--     select
--       to_char(s.day, 'YYYY-MM-DD') as day,
--       coalesce(cd.n, 0)            as conversations,
--       coalesce(rd.n, 0)            as ai_replies
--     from spine s
--     left join conv_by_day cd on cd.day = s.day
--     left join rep_by_day  rd on rd.day = s.day
--   )
--   select jsonb_build_object(
--     'funnel',        (select to_jsonb(funnel)       from funnel),
--     'response_time', (select to_jsonb(rt)           from rt),
--     'status_split',  (select to_jsonb(status_split) from status_split),
--     'messages',      (select jsonb_build_object('total', total_msgs,
--                               'avg_per_convo', case when n > 0 then round(total_msgs::numeric / n, 1) else 0 end)
--                        from msgs_agg),
--     'usage',         (select to_jsonb(ai)           from ai),
--     'followups',     (select to_jsonb(followups)    from followups),
--     'series',        (select coalesce(jsonb_agg(to_jsonb(series) order by day), '[]'::jsonb) from series)
--   );
-- $function$;
-- revoke all on function public.analytics_overview(timestamptz, timestamptz, uuid) from public, anon;
-- grant execute on function public.analytics_overview(timestamptz, timestamptz, uuid) to authenticated, service_role;
--
-- create function public.analytics_stage_conversations(
--   p_stage text,
--   p_from timestamptz,
--   p_to timestamptz,
--   p_chatbot_id uuid default null,
--   p_limit integer default 6,
--   p_offset integer default 0
-- )
-- returns table(id uuid, contact_username text, contact_name text, created_at timestamptz, total bigint)
-- language sql
-- stable
-- as $function$
--   with convs as (
--     select c.id, c.contact_username, c.contact_name, c.created_at
--     from public.conversations c
--     where c.user_id = auth.uid()
--       and c.created_at >= p_from and c.created_at < p_to
--       and (p_chatbot_id is null or c.chatbot_id = p_chatbot_id)
--       and case p_stage
--         when 'entry'   then true
--         when 'replied' then
--           exists(select 1 from public.messages m where m.conversation_id = c.id and m.role = 'user')
--           and exists(select 1 from public.messages m where m.conversation_id = c.id and m.role = 'assistant')
--         when 'link_sent' then
--           exists(select 1 from public.messages m where m.conversation_id = c.id and m.role = 'assistant' and m.content ~* 'https?://')
--         else false
--       end
--   )
--   select id, contact_username, contact_name, created_at, count(*) over () as total
--   from convs
--   order by created_at desc
--   limit p_limit offset p_offset;
-- $function$;
-- revoke all on function public.analytics_stage_conversations(text, timestamptz, timestamptz, uuid, integer, integer) from public, anon;
-- grant execute on function public.analytics_stage_conversations(text, timestamptz, timestamptz, uuid, integer, integer) to authenticated, service_role;
--
-- notify pgrst, 'reload schema';
-- commit;
