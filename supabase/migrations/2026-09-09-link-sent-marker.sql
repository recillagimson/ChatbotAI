-- Fix the link_sent_at false positive.
--
-- BACKGROUND. conversations.link_sent_at flips a lead from the pre-link follow-up
-- drip to the post-link sequence (lib/followup.ts resolveLinkSteps) and feeds the
-- "link sent" funnel stage. It was set by trigger mark_link_sent(), which fired on
-- ANY assistant message containing an http(s) URL. For a link-FLOW bot (e.g. LGF Pro)
-- the real signup link is delivered by a ManyChat flow: the bot emits the [[token]],
-- the webhook STRIPS it and writes a URL-less "(sent link: <name>)" marker row. So the
-- only https URL such a bot actually puts in message text is something ELSE - a reviews
-- link, a resource link - and that was tripping link_sent_at at the wrong moment
-- (observed 2026-09-09: a reviews share.google link set link_sent_at ~37 min before the
-- signup link actually went out).
--
-- FIX. Distinguish the two bot styles:
--   * link-FLOW bots (chatbots.link_flow_enabled = true): link_sent_at is set ONLY by the
--     "(sent link:" marker row (the webhook's explicit "signup link delivered" signal).
--     A raw URL in their text is NOT the signup link and no longer counts.
--   * URL bots (link_flow_enabled = false, ~20 of 24 bots today): UNCHANGED - a raw URL
--     in an assistant message still sets link_sent_at, because for them the pasted URL
--     IS how the link is delivered. No regression.
--
-- Re-runnable (create or replace). The existing AFTER INSERT trigger on public.messages
-- already calls this function by name, so its binding is unchanged - only the behaviour
-- is replaced. Apply in the Supabase dashboard SQL editor.

create or replace function public.mark_link_sent()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uses_link_flow boolean;
begin
  if new.role <> 'assistant' or new.content is null then
    return new;
  end if;

  -- 1) The explicit signal for link-flow bots: the webhook writes this marker row
  --    (lib/link-flow.ts linkSentMarker) when the ManyChat signup-link flow fires.
  --    This is the ACTUAL signup/CTA link, so it always counts.
  if new.content ~* '^\(sent link:' then
    update public.conversations
       set link_sent_at = now()
     where id = new.conversation_id
       and link_sent_at is null;      -- set-once: never churn / never move the marker
    return new;
  end if;

  -- 2) Otherwise fall back to a raw URL in the text, but ONLY for bots that do NOT
  --    deliver their link via a flow. For a link-flow bot a raw URL is a reviews /
  --    resource link, never the signup link, so it must not set link_sent_at.
  select c.link_flow_enabled
    into uses_link_flow
    from public.conversations conv
    join public.chatbots c on c.id = conv.chatbot_id
   where conv.id = new.conversation_id;

  if coalesce(uses_link_flow, false) = false
     and new.content ~* 'https?://[^[:space:]]' then
    update public.conversations
       set link_sent_at = now()
     where id = new.conversation_id
       and link_sent_at is null;
  end if;

  return new;
end;
$function$;

-- Rollback (restore the old URL-only behaviour):
-- create or replace function public.mark_link_sent()
-- returns trigger language plpgsql security definer set search_path to 'public'
-- as $function$
-- begin
--   if new.role = 'assistant' and new.content is not null
--      and new.content ~* 'https?://[^[:space:]]' then
--     update public.conversations set link_sent_at = now()
--      where id = new.conversation_id and link_sent_at is null;
--   end if;
--   return new;
-- end;
-- $function$;
