-- Workspace shell performance.
--
-- The dashboard SHELL (sidebar badges, chatbot switcher, follow-up counter) runs
-- on every page. It used to page EVERY conversation the user owns into app memory
-- just to compute a handful of counts. This migration lets the shell get those
-- counts from a grouped aggregate instead, and adds the index the shell's
-- user_id + last_message_at range scans were missing.
--
-- Re-runnable: create-if-not-exists + create-or-replace, matching the project's
-- one-shot manual apply.

-- ---------------------------------------------------------------------
-- Index: user_id + last_message_at
--   The workspace load, the follow-up reach-window slice, and the dashboard's
--   "this month" tag-mix all filter by user_id and range/order on
--   last_message_at. The only user_id-leading index was (user_id, tag), which
--   serves the equality filter but not the date range; this one does both.
--
--   CONCURRENTLY so the build does NOT take a write-blocking lock on the hot
--   conversations table (the ManyChat webhook writes to it constantly).
--   IMPORTANT: `create index concurrently` CANNOT run inside a transaction
--   block - run this single statement on its own (Supabase SQL editor runs it
--   fine; if your apply tool wraps the file in a txn, run this line separately
--   first, then apply the function below). If a concurrent build is interrupted
--   it leaves an INVALID index; `drop index if exists conversations_user_last_msg_idx;`
--   then re-run.
-- ---------------------------------------------------------------------
create index concurrently if not exists conversations_user_last_msg_idx
  on public.conversations (user_id, last_message_at desc);

-- ---------------------------------------------------------------------
-- Function: per-chatbot all-time rollup for the shell badges
--   One grouped row per chatbot - threads, needs-attention, and the distinct
--   channels the bot has seen - instead of every conversation row.
--
--   SECURITY INVOKER (the default, stated for intent): the function runs as the
--   caller, so the caller's RLS still scopes it to their own conversations, and
--   the superadmin "view as" overlay still authorises reading a client's rows -
--   exactly like the direct `.eq('user_id', ...)` query it replaces. It only
--   ever returns rows for the p_user_id passed in.
-- ---------------------------------------------------------------------
create or replace function public.workspace_conversation_rollup(p_user_id uuid)
returns table (
  chatbot_id uuid,
  threads bigint,
  needs_attention bigint,
  platforms text[]
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.chatbot_id,
    count(*) as threads,
    count(*) filter (where c.tag = 'needs_human') as needs_attention,
    array_agg(distinct coalesce(c.platform, 'instagram')) as platforms
  from public.conversations c
  where c.user_id = p_user_id
  group by c.chatbot_id
$$;

grant execute on function public.workspace_conversation_rollup(uuid) to authenticated;
