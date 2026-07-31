-- Conversation memory: a rolling prose summary of messages older than the
-- verbatim window, so the bot remembers long chats. Both columns nullable;
-- existing conversations are unaffected (no backfill - the summary builds up as
-- new messages arrive past the window).
--
-- memory_summary    = running summary of earlier turns (lead's name, goal,
--                     situation, commitments, open questions). NULL until a
--                     conversation grows past the window.
-- memory_summary_at = created_at watermark of the newest message already folded
--                     into the summary (so we only summarize what's new).
--
-- Apply in the Supabase dashboard SQL editor before deploying the memory feature.
alter table public.conversations add column if not exists memory_summary text;
alter table public.conversations add column if not exists memory_summary_at timestamptz;
