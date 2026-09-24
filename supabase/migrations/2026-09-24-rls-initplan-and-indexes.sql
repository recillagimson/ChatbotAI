-- Phase 1 / plan 01-02: RLS initplan rewrite + the three missing composite indexes.
--
-- THE PROBLEM
--   Every policy below calls auth.uid() or public.is_superadmin() bare. Postgres
--   treats a bare function call in a policy as a per-ROW expression, so on a scan
--   of N rows it runs N times. is_superadmin() is the expensive one: it is a
--   SECURITY DEFINER lookup into public.profiles, so a scan of 27,722
--   conversations does 27,722 profiles probes.
--
--   Wrapping the call in a scalar subquery - (select auth.uid()) - makes the
--   planner hoist it into an InitPlan evaluated ONCE per statement. Both
--   functions are STABLE (verified in pg_proc on 2026-09-24), which is exactly
--   the condition that makes this rewrite semantically identical.
--
--   MEASURED, applied to prod 2026-09-24. analytics_overview for the largest
--   tenant (16,607 conversations), run as the authenticated role with a real JWT
--   claim rather than a literal uuid:
--     7-day range:  6,080 ms -> 422 ms     (buffers 644,833 -> 306,815)
--     90-day range: 5,879 ms               (buffers 4,499,004)
--   The 7-day path is fixed. The 90-day path still sits only 2.1 s under the 8 s
--   statement_timeout, and the statistics page fires this RPC twice plus four
--   concurrent stage requests, so it stays at risk under load. That residue is
--   plan 01-03's job (the per-day and per-conversation correlated subqueries),
--   not this migration's.
--
--   The part B indexes were NOT the source of this win and are not yet proven
--   load-bearing: analytics_overview supplies its own user_id and created_at
--   predicates. Re-check their idx_scan counts in a week (PART C step 7).
--
-- WHAT IS AND IS NOT CHANGING
--   Changing: HOW the auth value is evaluated (once, not per row).
--   NOT changing: WHICH rows each policy admits. Every predicate keeps its exact
--   shape, operands and boolean structure. No policy's command, roles or
--   PERMISSIVE/RESTRICTIVE nature is touched.
--
--   ALTER POLICY is used deliberately instead of DROP + CREATE. It cannot alter
--   a policy's command or its PERMISSIVE/RESTRICTIVE nature at all, and although
--   the grammar does allow an optional TO clause, no statement below carries one,
--   so all 24 keep TO {public}. It also leaves no window in which a table has RLS
--   enabled but no policy, which would fail closed and 500 the dashboard
--   mid-migration.
--
--   Policies whose with_check is currently NULL get USING only. Adding a WITH
--   CHECK where none existed would change write behaviour on the FOR ALL
--   policies, so those are left alone on purpose: "own messages" and
--   "own profile write". Likewise the two INSERT policies have a NULL qual and
--   therefore get WITH CHECK only.
--
-- SOURCE OF TRUTH
--   Every predicate below was read out of pg_policies on prod on 2026-09-24, not
--   from supabase/schema.sql, which is known to be stale.
--
-- Re-runnable: ALTER POLICY is idempotent in effect, and part B is
-- create-if-not-exists.


-- =====================================================================
-- DO NOT RUN THIS FILE AS ONE BLOCK. Order of operations:
--   0. Run the pre-flight long-transaction query below. Do not start while
--      it returns rows.
--   1. Run PART C check 1 alone. Expect all 24 rows, so you know it can fire.
--   2. Run PART A (begin; ... commit;) as one paste.
--   3. Run PART C check 1 again. Expect 0 rows.
--   4. Run each PART B statement on its own, one at a time.
--   5. Do the behavioural smoke test in PART C step 5.
--
-- Pasted whole, PART A COMMITS and then the first `create index concurrently`
-- aborts with SQLSTATE 25001, leaving the rewrite applied and the indexes
-- missing, with an error that says nothing about PART A having succeeded.
-- (The one exception is `psql -f` WITHOUT -1, which sends a statement at a time.)
-- =====================================================================

-- PRE-FLIGHT - run alone. ALTER POLICY needs ACCESS EXCLUSIVE, and once that
-- request queues, every NEW read and write on the table queues behind it. If
-- anything below is holding a long transaction, wait for a quiet moment.
--
-- select pid, state, now() - xact_start as age, left(query, 80) as q
--   from pg_stat_activity
--  where datname = current_database()
--    and pid <> pg_backend_pid()
--    and xact_start is not null
--    and now() - xact_start > interval '5 seconds'
--  order by age desc;


-- =====================================================================
-- PART A - policy rewrites. Run THIS SECTION as one block (see banner above).
--
--   The catalog writes are metadata only and take milliseconds. Acquiring the
--   locks is the part that causes outages, which is what the timeouts below
--   bound. conversations and messages are written continuously by the ManyChat
--   webhook, and this transaction locks conversations before it requests
--   messages while an ordinary INSERT INTO messages holds ROW EXCLUSIVE on
--   messages and needs conversations for its FK check. That is a real deadlock
--   cycle, and lock_timeout is what stops it waiting forever (the default is 0,
--   meaning no timeout at all).
--
--   On SQLSTATE 55P03 (lock_not_available) or 40P01 (deadlock_detected) the
--   WHOLE transaction rolls back with nothing applied. Wait, then re-run the
--   identical block. It is safe to retry.
-- =====================================================================
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- ---------- change_requests ----------
alter policy "cr admin update" on public.change_requests
  using ((select public.is_superadmin()))
  with check ((select public.is_superadmin()));

alter policy "cr owner insert" on public.change_requests
  with check (
    ((select auth.uid()) = user_id)
    and (chatbot_id in (
      select chatbots.id from public.chatbots
      where chatbots.user_id = (select auth.uid())
    ))
  );

alter policy "cr read" on public.change_requests
  using (((select auth.uid()) = user_id) or (select public.is_superadmin()));

-- ---------- chatbots ----------
alter policy "admin all chatbots" on public.chatbots
  using ((select public.is_superadmin()))
  with check ((select public.is_superadmin()));

alter policy "own chatbots" on public.chatbots
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------- conversations ----------
alter policy "admin all conversations" on public.conversations
  using ((select public.is_superadmin()))
  with check ((select public.is_superadmin()));

alter policy "own conversations" on public.conversations
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------- feedback ----------
alter policy "fb admin update" on public.feedback
  using ((select public.is_superadmin()))
  with check ((select public.is_superadmin()));

alter policy "fb owner insert" on public.feedback
  with check ((select auth.uid()) = user_id);

alter policy "fb read" on public.feedback
  using (((select auth.uid()) = user_id) or (select public.is_superadmin()));

-- ---------- followup_assets ----------
alter policy "admin all followup_assets" on public.followup_assets
  using ((select public.is_superadmin()))
  with check ((select public.is_superadmin()));

alter policy "own followup_assets" on public.followup_assets
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------- kb_chunks ----------
alter policy "own kb chunks" on public.kb_chunks
  using ((select auth.uid()) = user_id)
  with check (
    ((select auth.uid()) = user_id)
    and (chatbot_id in (
      select chatbots.id from public.chatbots
      where chatbots.user_id = (select auth.uid())
    ))
  );

-- ---------- knowledge_base ----------
alter policy "admin all kb" on public.knowledge_base
  using ((select public.is_superadmin()))
  with check ((select public.is_superadmin()));

alter policy "own kb" on public.knowledge_base
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------- messages ----------
alter policy "admin all messages" on public.messages
  using ((select public.is_superadmin()))
  with check ((select public.is_superadmin()));

-- USING only: this policy's with_check is NULL today, and on a FOR ALL policy a
-- NULL with_check means writes are checked against USING. Adding one would be a
-- behaviour change, so it is deliberately omitted.
alter policy "own messages" on public.messages
  using (exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and c.user_id = (select auth.uid())
  ));

-- ---------- profiles ----------
-- Note on recursion: is_superadmin() reads public.profiles, which is itself
-- governed by the policies just below. It does not recurse, but the reason is
-- NOT "because it is SECURITY DEFINER". SECURITY DEFINER only makes it run as
-- its OWNER; what actually skips RLS is that the owner also owns public.profiles,
-- and a table owner bypasses RLS while FORCE ROW LEVEL SECURITY is unset. It is
-- unset (no `force row level security` anywhere in supabase/).
-- INVARIANT: do not set FORCE ROW LEVEL SECURITY on public.profiles, and do not
-- reassign ownership of is_superadmin(), without first rewriting these policies.
alter policy "admin read profiles" on public.profiles
  using ((select public.is_superadmin()));

alter policy "own profile read" on public.profiles
  using ((select auth.uid()) = id);

-- USING only: with_check is NULL today (see the "own messages" note).
alter policy "own profile write" on public.profiles
  using ((select auth.uid()) = id);

-- ---------- subscriptions ----------
alter policy "admin read subscriptions" on public.subscriptions
  using ((select public.is_superadmin()));

alter policy "own sub read" on public.subscriptions
  using ((select auth.uid()) = user_id);

-- ---------- usage_log ----------
alter policy "admin read usage" on public.usage_log
  using ((select public.is_superadmin()));

alter policy "own usage" on public.usage_log
  using ((select auth.uid()) = user_id);

commit;


-- =====================================================================
-- PART B - indexes. Run each statement ALONE, outside a transaction.
--          create index concurrently CANNOT run inside a transaction block.
--          If a build is interrupted it leaves an INVALID index; recover with
--          drop index if exists <name>; then re-run that one statement.
-- =====================================================================

-- conversations: the analytics range scans filter user_id and order/bound on
-- created_at. The only user_id-leading indexes today are (user_id, tag) and
-- (user_id, last_message_at DESC); neither serves a created_at range, so these
-- scans currently seq-scan. Verified against pg_indexes on 2026-09-24.
create index concurrently if not exists conversations_user_created_idx
  on public.conversations (user_id, created_at desc);

-- usage_log: analytics filters user_id + event_type and bounds created_at.
-- Do NOT drop usage_user_idx (user_id, created_at DESC) afterwards: it is NOT a
-- prefix of this composite, because event_type sits between its two columns. It
-- is also live, at 6,306 scans.
create index concurrently if not exists usage_log_user_event_created_idx
  on public.usage_log (user_id, event_type, created_at desc);

-- usage_log: per-bot scoping has no supporting index at all today; usage_log
-- carries only usage_log_pkey and usage_user_idx.
create index concurrently if not exists usage_log_chatbot_created_idx
  on public.usage_log (chatbot_id, created_at desc);


-- =====================================================================
-- PART C - verify. Run check 1 BEFORE part A as well as after.
-- =====================================================================
-- 1) Residual bare calls in schema public. Expect 24 rows BEFORE part A and
--    0 rows AFTER. Run it before, so you have seen it fire; a check that has
--    never returned non-zero is not a check.
--
--    Why it is written this way: pg_policies.qual and .with_check are rendered
--    by pg_get_expr, which deparses keywords in UPPERCASE, so a case-SENSITIVE
--    match on a lowercase 'select' can never succeed and would report a correct
--    migration as a total failure. This strips every correctly wrapped call
--    first and then looks for survivors, so it is case-insensitive AND still
--    catches a predicate that holds one wrapped call and one bare one.
--
-- select tablename, policyname, cmd, qual, with_check
--   from pg_policies
--  where schemaname = 'public'
--    and regexp_replace(
--          coalesce(qual, '') || ' ' || coalesce(with_check, ''),
--          '\(\s*SELECT\s+(public\.)?(auth\.uid|is_superadmin)\(\)(\s+AS\s+"?[a-z_0-9]+"?)?\s*\)',
--          '', 'gi')
--        ~* '(auth\.uid|is_superadmin)\s*\(\)';

-- 2) Shape map for ALL 24 policies, not a two-policy spot check. A spot check
--    cannot see a with_check accidentally added to one of the other eight NULL
--    ones, nor one dropped from any of the fourteen that have one.
--
-- select count(*) as total,
--        count(*) filter (where with_check is null) as using_only,
--        count(*) filter (where qual is null)       as check_only
--   from pg_policies where schemaname = 'public';
-- -- expect 24 / 10 / 2
--
-- select tablename, policyname from pg_policies
--  where schemaname = 'public'
--    and (permissive <> 'PERMISSIVE' or roles::text <> '{public}');
-- -- expect 0 rows

-- 3) The three indexes exist and are valid. Joined through pg_class rather than
--    indexrelid::regclass::text, which is search_path dependent and would
--    silently match nothing in a session whose search_path lacks public.
--
-- select t.relname as tbl, c.relname as idx, i.indisvalid
--   from pg_index i
--   join pg_class c on c.oid = i.indexrelid
--   join pg_class t on t.oid = i.indrelid
--   join pg_namespace n on n.oid = c.relnamespace
--  where n.nspname = 'public'
--    and c.relname in ('conversations_user_created_idx',
--                      'usage_log_user_event_created_idx',
--                      'usage_log_chatbot_created_idx');
-- -- expect 3 rows, all indisvalid = t

-- 4) The Supabase auth_rls_initplan linter will NOT reach zero, and that is
--    expected. Ten policies on storage.objects still call both functions bare:
--    five in supabase/schema.sql and five in 2026-07-01-followup-media.sql.
--    They are out of scope here by design; wrapping them needs a role that owns
--    storage.objects (supabase_storage_admin). The target for THIS migration is
--    zero residual warnings for schema public only.

-- 5) BEHAVIOURAL SMOKE TEST. This is the only check that can catch a row
--    visibility regression; nothing in the catalog queries above can.
--    Sign in as a NON-superadmin tenant: the inbox, statistics and
--    knowledge-base must show exactly that tenant's own rows, no more and no
--    fewer. Then sign in as a superadmin: admin views must still show
--    everything. Do this before considering the migration done.

-- 6) Confirm the plan actually changed, and replace the estimate in this file's
--    header with the real numbers. Run as an authenticated NON-superadmin with a
--    JWT claim set, never with a literal uuid: a literal-uuid run bypasses the
--    per-row auth cost entirely and reports a time that has nothing to do with
--    production.
--
-- explain (analyze, buffers) <the real dashboard query>;

-- 7) One week after deploy, check the new indexes are earning their write cost,
--    especially usage_log_chatbot_created_idx: analytics_overview scopes per bot
--    with (p_chatbot_id is null or c.chatbot_id = p_chatbot_id), an OR against a
--    parameter that the planner will generally not turn into an index scan.
--    usage_log is written on every AI reply, so an unused index is pure overhead.
--
-- select relname, indexrelname, idx_scan,
--        pg_size_pretty(pg_relation_size(indexrelid))
--   from pg_stat_user_indexes where relname in ('usage_log','conversations');


-- =====================================================================
-- ROLLBACK - the pre-migration predicates, verbatim from pg_policies on
-- 2026-09-24. Have this open BEFORE you start rather than composing it under
-- pressure. Run inside the same begin; / commit; shape as part A.
-- =====================================================================
-- begin;
-- set local lock_timeout = '3s';
--
-- alter policy "cr admin update" on public.change_requests
--   using (is_superadmin()) with check (is_superadmin());
-- alter policy "cr owner insert" on public.change_requests
--   with check ((auth.uid() = user_id) and (chatbot_id in (
--     select chatbots.id from chatbots where chatbots.user_id = auth.uid())));
-- alter policy "cr read" on public.change_requests
--   using ((auth.uid() = user_id) or is_superadmin());
-- alter policy "admin all chatbots" on public.chatbots
--   using (is_superadmin()) with check (is_superadmin());
-- alter policy "own chatbots" on public.chatbots
--   using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- alter policy "admin all conversations" on public.conversations
--   using (is_superadmin()) with check (is_superadmin());
-- alter policy "own conversations" on public.conversations
--   using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- alter policy "fb admin update" on public.feedback
--   using (is_superadmin()) with check (is_superadmin());
-- alter policy "fb owner insert" on public.feedback
--   with check (auth.uid() = user_id);
-- alter policy "fb read" on public.feedback
--   using ((auth.uid() = user_id) or is_superadmin());
-- alter policy "admin all followup_assets" on public.followup_assets
--   using (is_superadmin()) with check (is_superadmin());
-- alter policy "own followup_assets" on public.followup_assets
--   using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- alter policy "own kb chunks" on public.kb_chunks
--   using (auth.uid() = user_id)
--   with check ((auth.uid() = user_id) and (chatbot_id in (
--     select chatbots.id from chatbots where chatbots.user_id = auth.uid())));
-- alter policy "admin all kb" on public.knowledge_base
--   using (is_superadmin()) with check (is_superadmin());
-- alter policy "own kb" on public.knowledge_base
--   using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- alter policy "admin all messages" on public.messages
--   using (is_superadmin()) with check (is_superadmin());
-- alter policy "own messages" on public.messages
--   using (exists (select 1 from conversations c
--     where c.id = messages.conversation_id and c.user_id = auth.uid()));
-- alter policy "admin read profiles" on public.profiles using (is_superadmin());
-- alter policy "own profile read" on public.profiles using (auth.uid() = id);
-- alter policy "own profile write" on public.profiles using (auth.uid() = id);
-- alter policy "admin read subscriptions" on public.subscriptions
--   using (is_superadmin());
-- alter policy "own sub read" on public.subscriptions using (auth.uid() = user_id);
-- alter policy "admin read usage" on public.usage_log using (is_superadmin());
-- alter policy "own usage" on public.usage_log using (auth.uid() = user_id);
--
-- commit;
--
-- For part B, each run ALONE:
--   drop index concurrently if exists public.conversations_user_created_idx;
--   drop index concurrently if exists public.usage_log_user_event_created_idx;
--   drop index concurrently if exists public.usage_log_chatbot_created_idx;
