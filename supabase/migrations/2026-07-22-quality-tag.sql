-- Conversation quality tag - a SEPARATE, owner-set quality rating, ORTHOGONAL to the
-- funnel `tag` (lead/wants_call/subscribed/…). A thread can be e.g. both 'subscribed'
-- AND 'good'. Manual only (set from the inbox), so the AI classifier never touches it.
-- Null = unrated (the default for every conversation).
alter table public.conversations
  add column if not exists quality_tag text;

alter table public.conversations drop constraint if exists conversations_quality_tag_check;
alter table public.conversations add constraint conversations_quality_tag_check
  check (quality_tag is null or quality_tag in ('good', 'bad'));

-- Teardown:
-- alter table public.conversations drop constraint if exists conversations_quality_tag_check;
-- alter table public.conversations drop column if exists quality_tag;
