-- Phase 1 / plan 01-03: rewrite analytics_overview to drop its correlated subqueries.
--
-- THE PROBLEM
--   Two nested loops, both quadratic in tenant size:
--
--   1. msgflags ran SIX correlated subqueries over public.messages for EVERY
--      conversation in range. For the largest tenant that is ~100k subquery
--      executions for a single report.
--
--   2. series ran, FOR EACH DAY in the range, a count over public.usage_log
--      whose only date predicate was date_trunc('day', u.created_at) = d. That
--      is not sargable, so it could not use an index and could not be bounded:
--      each of the 90 days scanned the whole table. This is where the buffers
--      went.
--
--   Both are replaced by a single grouped pass joined back to the driving set.
--
-- MEASURED on prod, largest tenant (16,607 conversations), as the authenticated
-- role with a real JWT claim:
--     90-day range: 11,554 ms -> 1,163 ms
--   The old function was EXCEEDING the 8 s statement_timeout at 90 days, which
--   is the 57014 the statistics page was reporting. (An earlier EXPLAIN showed
--   5,879 ms on a warm cache; 11,554 ms is the figure from a timed cold-ish run.)
--
-- EQUIVALENCE, verified before writing this file rather than asserted. The new
-- body was built as a pg_temp function and compared to the live one with `=` on
-- the returned jsonb, as the authenticated role, over real production data. All
-- six input shapes returned identical:
--     7-day non-midnight-aligned   identical
--     90-day                       identical
--     bot-scoped (p_chatbot_id)    identical
--     empty range (future window)  identical
--     midnight-aligned             identical
--     sub-day (6 hours)            identical
--
-- THE ONE SUBTLE PART
--   The old series counted usage_log rows by matching date_trunc('day', created_at)
--   against the day spine. The spine runs from date_trunc('day', p_from) to
--   date_trunc('day', p_to - 1 second), so it covers WHOLE days even when p_from
--   is not midnight-aligned - and `now() - interval '7 days'` never is.
--   Bounding the new grouped scan by p_from/p_to would therefore have quietly
--   dropped the first partial day. It is bounded by the SPINE's range instead:
--     created_at >= date_trunc('day', p_from)
--     created_at <  date_trunc('day', p_to - interval '1 second') + interval '1 day'
--   which is exactly the set the old per-day predicate matched, and is sargable.
--   The sub-day test case above is what proves this.
--
--   Note also that msg_count and the has_* flags are deliberately NOT date-bounded
--   on messages. The old subqueries filtered only on conversation_id, so a
--   conversation created in range counts ALL of its messages regardless of when
--   they were sent. Adding a message-side date filter would have been a silent
--   behaviour change.
--
-- NOT DOING
--   This does NOT convert the function to SECURITY DEFINER with a client-supplied
--   p_user_id. That would replace RLS enforcement with a hand-written guard on a
--   multi-tenant read path, and it is unnecessary: the win here is purely from
--   removing the nested loops. Keep it STABLE and RLS-governed.
--
--   The has_link test keeps the ~* 'https?://' regex rather than switching to
--   conversations.link_sent_at, which only carries data for windows after
--   2026-09-09 and would silently under-report older ranges.
--
-- GRANTS
--   schema.sql:631-632 revokes this function from public/anon and grants execute
--   to authenticated. CREATE OR REPLACE preserves grants because it does not drop
--   and recreate the object, so nothing needs re-granting. Verify step 4 checks
--   this rather than trusting it.
--
-- Re-runnable: CREATE OR REPLACE. Safe to run as one statement; it takes no lock
-- on table data, only briefly on the function's catalog row.


create or replace function public.analytics_overview(
  p_from timestamptz,
  p_to timestamptz,
  p_chatbot_id uuid default null
)
returns jsonb
language sql
stable
as $function$
  with convs as (
    select c.id, c.status, c.created_at, c.followup_count
    from public.conversations c
    where c.user_id = (select auth.uid())
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
    where u.user_id = (select auth.uid())
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
    where u.user_id = (select auth.uid())
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


-- =====================================================================
-- VERIFY
-- =====================================================================
-- 1) Timing, as an authenticated NON-superadmin with a real JWT claim. Never
--    with a literal uuid: that bypasses the per-row auth cost and reports a
--    number unrelated to production.
--
-- begin;
-- select set_config('request.jwt.claims','{"sub":"<a real tenant uuid>","role":"authenticated"}',true);
-- set local role authenticated;
-- explain (analyze, buffers)
--   select * from public.analytics_overview(now() - interval '90 days', now(), null);
-- rollback;
-- -- expect roughly 1.2 s, versus 11.5 s before

-- 2) Open /statistics as that tenant at EVERY preset range including the widest,
--    and confirm the "This report timed out" panel never renders. Then check the
--    numbers against what the page showed before: entry, replied, link_sent, the
--    status split and the daily series must be unchanged.

-- 3) Supabase logs should show zero 57014 for analytics_overview over a week.

-- 4) Grants survived the replace. Expect execute for authenticated, and NOT for
--    anon or public.
--
-- select grantee, privilege_type
--   from information_schema.routine_privileges
--  where routine_schema = 'public' and routine_name = 'analytics_overview';


-- =====================================================================
-- ROLLBACK - the original body, verbatim from pg_get_functiondef on 2026-09-24.
-- =====================================================================
-- create or replace function public.analytics_overview(
--   p_from timestamptz, p_to timestamptz, p_chatbot_id uuid default null)
-- returns jsonb language sql stable as $function$
--   with convs as (
--     select c.id, c.status, c.created_at, c.followup_count
--     from public.conversations c
--     where c.user_id = auth.uid()
--       and c.created_at >= p_from and c.created_at < p_to
--       and (p_chatbot_id is null or c.chatbot_id = p_chatbot_id)
--   ),
--   msgflags as (
--     select cv.id,
--       exists(select 1 from public.messages m where m.conversation_id = cv.id and m.role = 'user')      as has_user,
--       exists(select 1 from public.messages m where m.conversation_id = cv.id and m.role = 'assistant') as has_assistant,
--       exists(select 1 from public.messages m where m.conversation_id = cv.id and m.role = 'assistant'
--              and m.content ~* 'https?://')                                                             as has_link,
--       (select count(*)        from public.messages m where m.conversation_id = cv.id)                  as msg_count,
--       (select min(m.created_at) from public.messages m where m.conversation_id = cv.id and m.role = 'user')      as first_user,
--       (select min(m.created_at) from public.messages m where m.conversation_id = cv.id and m.role = 'assistant') as first_assistant
--     from convs cv
--   ),
--   funnel as (
--     select (select count(*) from convs) as entry,
--            (select count(*) from msgflags where has_user and has_assistant) as replied,
--            (select count(*) from msgflags where has_link) as link_sent
--   ),
--   rt as (
--     select avg(extract(epoch from (first_assistant - first_user))) as avg_secs,
--            percentile_cont(0.5) within group (order by extract(epoch from (first_assistant - first_user))) as median_secs
--     from msgflags
--     where first_assistant is not null and first_user is not null and first_assistant >= first_user
--   ),
--   status_split as (
--     select count(*) filter (where status = 'active') as active,
--            count(*) filter (where status = 'ai_paused') as ai_paused,
--            count(*) filter (where status = 'closed') as closed
--     from convs
--   ),
--   msgs_agg as (select coalesce(sum(msg_count), 0) as total_msgs, count(*) as n from msgflags),
--   ai as (
--     select count(*) filter (where u.event_type = 'ai_reply') as ai_replies,
--            coalesce(sum(u.tokens_used) filter (where u.event_type = 'ai_reply'), 0) as tokens,
--            count(*) filter (where u.event_type in ('push_failed','no_manychat_api_key','manychat_key_decrypt_failed')) as delivery_failures
--     from public.usage_log u
--     where u.user_id = auth.uid()
--       and u.created_at >= p_from and u.created_at < p_to
--       and (p_chatbot_id is null or u.chatbot_id = p_chatbot_id)
--   ),
--   followups as (
--     select coalesce(sum(followup_count), 0) as followups_sent,
--            count(*) filter (where followup_count > 0) as conv_with_followup
--     from convs
--   ),
--   series as (
--     select to_char(d::date, 'YYYY-MM-DD') as day,
--       (select count(*) from convs c where date_trunc('day', c.created_at) = d) as conversations,
--       (select count(*) from public.usage_log u
--          where u.user_id = auth.uid() and u.event_type = 'ai_reply'
--            and date_trunc('day', u.created_at) = d
--            and (p_chatbot_id is null or u.chatbot_id = p_chatbot_id)) as ai_replies
--     from generate_series(date_trunc('day', p_from),
--                          date_trunc('day', p_to - interval '1 second'),
--                          interval '1 day') d
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
