-- Apply the never-applied 2026-07-23 push-reconcile migration.
--
-- WHY THIS FILE EXISTS
--   supabase/migrations/2026-07-23-push-reconcile.sql was written but never
--   applied to production. Verified against prod on 2026-09-24:
--   information_schema reports 9 columns on public.messages and neither
--   delivery_status nor delivery_attempts is among them, and pg_indexes shows
--   only messages_pkey and messages_conv_idx. A full sweep of every other
--   migration in this directory (68 expected columns, 5 expected indexes)
--   found no other drift, so this is the only one that was missed.
--
-- WHAT THAT COST
--   lib/delivery.ts:36 marks a saved message 'failed' when a ManyChat push
--   throws after its own retries. That UPDATE has been erroring on a missing
--   column ever since. supabase-js RETURNS {error} rather than throwing, so
--   the try/catch around it never fires and the return value is discarded:
--   every push failure has been lost silently, with nothing in the logs.
--   app/api/cron/reconcile-pushes runs every 10 minutes (vercel.json) and has
--   failed on the same missing column each time, so the retry safety net for
--   genuinely-dropped replies has never once worked.
--
-- COLUMN MEANINGS (unchanged from the 2026-07-23 file)
--   delivery_status: null        = delivered inline / not tracked (common path)
--                    'failed'    = push threw after retries (saved, NOT delivered)
--                    'delivered' = a reconcile-cron retry succeeded
--                    'abandoned' = gave up (out of window, too many attempts, or
--                                  multi-bubble, which must not be resent)
--   delivery_attempts: how many reconcile retries this row has had, capped by
--                      MAX_ATTEMPTS in the cron.
--
-- This supersedes 2026-07-23-push-reconcile.sql, whose only defect was a
-- non-concurrent index build. Re-runnable: if-not-exists throughout.


-- =====================================================================
-- STEP 1 - run this block on its own, first.
--
--   add column with a non-volatile default is metadata-only in PG 11+, so this
--   does NOT rewrite the ~170k-row messages table. The ACCESS EXCLUSIVE lock it
--   takes is held for microseconds.
-- =====================================================================
alter table public.messages
  add column if not exists delivery_status text,
  add column if not exists delivery_attempts integer not null default 0;


-- =====================================================================
-- STEP 2 - run this single statement on its own, AFTER step 1 commits.
--
--   Partial index: the reconcile cron only ever scans the small 'failed' set,
--   so the index stays tiny no matter how large messages grows.
--
--   CONCURRENTLY because messages is the hottest write table in the system: the
--   ManyChat webhook inserts on every inbound DM and every outbound bubble. A
--   plain create index would hold ACCESS EXCLUSIVE for the whole heap scan and
--   stall the reply path. Same reasoning as 2026-08-17-workspace-perf.sql:19-26.
--
--   IMPORTANT: create index concurrently CANNOT run inside a transaction block.
--   Paste it alone. If the build is interrupted it leaves an INVALID index;
--   recover with
--       drop index if exists public.messages_delivery_failed_idx;
--   then re-run this statement.
-- =====================================================================
create index concurrently if not exists messages_delivery_failed_idx
  on public.messages (created_at)
  where delivery_status = 'failed';


-- =====================================================================
-- STEP 3 - verify. Expect 11 columns, 3 indexes, and indisvalid = true.
-- =====================================================================
-- select count(*) from information_schema.columns
--   where table_schema = 'public' and table_name = 'messages';            -- 11
--
-- select indexname from pg_indexes
--   where schemaname = 'public' and tablename = 'messages';               -- 3 rows
--
-- select indisvalid from pg_index
--   where indexrelid = 'public.messages_delivery_failed_idx'::regclass;   -- t
--
-- After the next inbound DM, the reconcile cron should log ok:true instead of
-- "[reconcile-pushes] query error". Rows only appear in the 'failed' set when a
-- push genuinely throws, so an empty set here is the healthy state, not a sign
-- the migration did nothing.
