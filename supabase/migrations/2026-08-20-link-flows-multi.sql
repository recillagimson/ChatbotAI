-- Multiple link triggers per bot: an array of {token, ns, name, ns_fb, name_fb}.
-- When non-empty it overrides the single link_flow_* columns; empty falls back to them.
alter table public.chatbots
  add column if not exists link_flows jsonb not null default '[]'::jsonb;
