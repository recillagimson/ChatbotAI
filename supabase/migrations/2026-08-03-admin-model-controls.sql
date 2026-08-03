-- Admin-only per-chatbot model controls (see CLAUDE.md gotcha).
-- reply_model: superadmin-selectable per-bot reactive-reply model. NULL = use the
--   reply-tier default (MODELS.reply()). An unknown value falls back to the default
--   at resolve time (defense-in-depth), so this column is safe to leave loose text.
-- force_retrieval: superadmin-only. Force KB vector retrieval regardless of KB size
--   (bypasses RETRIEVAL_CUTOVER) to cut per-reply tokens on small-but-heavily-used
--   KBs. Takes effect ONLY once the bot's KB is indexed (unindexed -> full-context
--   safety in decideMode still wins). Reuses chatbots.retrieval_active hysteresis.
alter table public.chatbots
  add column if not exists reply_model text,
  add column if not exists force_retrieval boolean not null default false;

-- These two columns are ADMIN-ONLY. The UI hides the controls from non-admins,
-- but the "own chatbots" RLS policy would still let an owner set them directly
-- (e.g. via devtools), self-selecting a pricier reply model / forcing retrieval
-- on their own bot. Enforce admin-only at the data layer so the UI gate can't be
-- bypassed. Allowed: superadmins (auth.uid()'s profile.is_superadmin) and trusted
-- service-role writes (auth.uid() is null, e.g. retrieval_active hysteresis — which
-- is a DIFFERENT column and not guarded here). Blocked: an authenticated non-admin
-- changing reply_model or force_retrieval. Other columns are unaffected.
create or replace function public.guard_admin_only_chatbot_cols()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.reply_model is distinct from old.reply_model
      or new.force_retrieval is distinct from old.force_retrieval)
     and auth.uid() is not null
     and not public.is_superadmin() then
    raise exception 'reply_model and force_retrieval are admin-only'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_admin_only_chatbot_cols on public.chatbots;
create trigger guard_admin_only_chatbot_cols
  before update on public.chatbots
  for each row execute function public.guard_admin_only_chatbot_cols();
