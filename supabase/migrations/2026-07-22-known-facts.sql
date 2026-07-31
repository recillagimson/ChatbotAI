-- Known facts: a durable, compact list of concrete things the LEAD has stated or
-- shown about themselves and what they want (answers to qualifying questions -
-- credit score / numbers, goals, products, timeline, budget, decisions). Maintained
-- in the background after each reply (lib/lead-facts.ts) and injected into the
-- assistant's system prompt with a hard "never re-ask these" rule so the bot stops
-- asking for things the lead already answered (typed OR sent as a photo/voice/doc).
-- Null/empty = nothing concrete established yet. Multi-tenant: format is domain-neutral.
alter table public.conversations
  add column if not exists known_facts text;

-- Teardown:
-- alter table public.conversations drop column if exists known_facts;
