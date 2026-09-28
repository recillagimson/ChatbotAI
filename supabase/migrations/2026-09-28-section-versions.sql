-- 2026-09-28: version history for the three prompt sections.
--
-- Why: Request Changes, the Prompt tab, the team's admin edits and the kb-sync
-- script all overwrite chatbots.persona_section / offers_section /
-- rebuttals_section in place, and nothing kept the previous text, so a bad
-- change could not be undone. This records the text a section had BEFORE each
-- change, from a trigger, so every writer is covered - including service-role
-- scripts that never go through the app.
--
-- Safe to apply before or after the app deploy: the app treats a missing table
-- as "history is not switched on yet". Idempotent (re-running is harmless).

create table if not exists public.chatbot_section_versions (
  id          uuid primary key default gen_random_uuid(),
  chatbot_id  uuid not null references public.chatbots(id) on delete cascade,
  section     text not null check (section in ('persona_section', 'offers_section', 'rebuttals_section')),
  content     text,          -- the section text BEFORE the change (null = it was empty)
  changed_by  uuid,          -- auth.uid() of the writer; null = a service-role write (a server route or a script)
  created_at  timestamptz not null default now()
);

create index if not exists chatbot_section_versions_lookup
  on public.chatbot_section_versions (chatbot_id, section, created_at desc);

alter table public.chatbot_section_versions enable row level security;

-- Read: the bot's CURRENT owner (checked through chatbots, so a transferred bot's
-- history follows it to the new owner) or a superadmin. There are no write
-- policies: rows are only ever written by the trigger below.
drop policy if exists "section versions: owner reads" on public.chatbot_section_versions;
create policy "section versions: owner reads" on public.chatbot_section_versions
  for select using (
    exists (select 1 from public.chatbots c
             where c.id = chatbot_id and c.user_id = auth.uid())
  );

drop policy if exists "section versions: superadmin reads" on public.chatbot_section_versions;
create policy "section versions: superadmin reads" on public.chatbot_section_versions
  for select using ( public.is_superadmin() );

revoke insert, update, delete on public.chatbot_section_versions from anon, authenticated;
grant select on public.chatbot_section_versions to authenticated;

create or replace function public.record_chatbot_section_versions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recorded boolean := false;
begin
  if new.persona_section is distinct from old.persona_section then
    insert into public.chatbot_section_versions (chatbot_id, section, content, changed_by)
    values (old.id, 'persona_section', old.persona_section, auth.uid());
    recorded := true;
  end if;

  if new.offers_section is distinct from old.offers_section then
    insert into public.chatbot_section_versions (chatbot_id, section, content, changed_by)
    values (old.id, 'offers_section', old.offers_section, auth.uid());
    recorded := true;
  end if;

  if new.rebuttals_section is distinct from old.rebuttals_section then
    insert into public.chatbot_section_versions (chatbot_id, section, content, changed_by)
    values (old.id, 'rebuttals_section', old.rebuttals_section, auth.uid());
    recorded := true;
  end if;

  -- Keep the newest 50 versions per section for this bot.
  if recorded then
    delete from public.chatbot_section_versions v
     using (
       select id,
              row_number() over (partition by section order by created_at desc, id desc) as rn
         from public.chatbot_section_versions
        where chatbot_id = old.id
     ) ranked
     where v.id = ranked.id and ranked.rn > 50;
  end if;

  return new;
end;
$$;

-- Only the trigger calls it.
revoke execute on function public.record_chatbot_section_versions() from public, anon, authenticated;

drop trigger if exists chatbots_section_versions on public.chatbots;
create trigger chatbots_section_versions
  after update of persona_section, offers_section, rebuttals_section on public.chatbots
  for each row execute function public.record_chatbot_section_versions();
