-- Reply debounce / single-flight claim.
--
-- The webhook now waits REPLY_DEBOUNCE_MS (default 5s) after an inbound message
-- before answering, so a rapid burst of messages gets ONE consolidated reply.
-- reply_claimed_for = inbound message id (uuid) of the newest AI-bound webhook
-- run for this conversation. Each run OVERWRITES it with its own message id
-- before sleeping; after generating, a conditional release
-- (update ... set reply_claimed_for = null where reply_claimed_for = <my id>)
-- decides the single run allowed to persist + send. NULL = no reply in flight.
--
-- Transient coordination state: no FK (messages cascade with the conversation
-- anyway), no index needed (always addressed via the conversation PK), and a
-- stale value after a crashed run is harmless (the next run overwrites it).
--
-- Re-runnable. Apply in the Supabase dashboard SQL editor BEFORE deploying the
-- debounce code (the code fail-opens to single-message mode if the column is
-- missing, so ordering is safe either way).
alter table public.conversations
  add column if not exists reply_claimed_for uuid;
