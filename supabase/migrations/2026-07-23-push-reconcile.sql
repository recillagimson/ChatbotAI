-- !! NEVER APPLIED. SUPERSEDED BY 2026-09-24-push-reconcile-apply.sql !!
--    Confirmed against production on 2026-09-24: neither column below exists.
--    Do not paste THIS file: its `create index` is non-concurrent and would
--    take a write-blocking ACCESS EXCLUSIVE lock on the hot messages table.
--    Use the 2026-09-24 file, which splits the steps and builds CONCURRENTLY.
--
-- Outbound delivery tracking so a genuinely-dropped ManyChat push can be
-- reconciled (retried) instead of silently lost.
--   delivery_status: null      = delivered inline / not tracked (the common path)
--                    'failed'   = push threw after retries (saved but NOT delivered)
--                    'delivered'= a reconcile-cron retry succeeded
--                    'abandoned'= gave up (out of window, too many attempts, multi-bubble)
--   delivery_attempts: how many reconcile retries this row has had (capped by the cron).
alter table public.messages
  add column if not exists delivery_status text,
  add column if not exists delivery_attempts integer not null default 0;

-- Partial index: the reconcile cron only ever scans the small 'failed' set.
create index if not exists messages_delivery_failed_idx
  on public.messages (created_at)
  where delivery_status = 'failed';
