-- Link via ManyChat: when link_flow_enabled and a flow is set, the reactive reply
-- delegates the signup-link send to a native ManyChat flow instead of sending a raw
-- URL. The AI emits link_flow_token (default [[SEND_LINK]]) to signal "send the link
-- now"; SpeedSettr strips the token and fires the flow for the lead's channel
-- (link_flow_ns for Instagram/default, link_flow_ns_fb for Messenger, which falls
-- back to link_flow_ns). Solves Instagram silently stripping links from automated DMs.
-- Default off: an un-set-up bot behaves exactly as today.
alter table public.chatbots
  add column if not exists link_flow_enabled boolean not null default false,
  add column if not exists link_flow_ns text,
  add column if not exists link_flow_name text,
  add column if not exists link_flow_ns_fb text,
  add column if not exists link_flow_name_fb text,
  add column if not exists link_flow_token text;
