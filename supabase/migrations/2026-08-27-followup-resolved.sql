-- ===========================================================================
-- Manual follow-up "Resolved" (per-band dismissal) (2026-08-27)
-- ===========================================================================
-- The Follow-ups page splits the manual window [24h, 7d) into age bands (1/3/5/7 day),
-- and a thread lands in exactly one band by how long the LEAD has been silent. A user
-- who does the follow-up by hand in ManyChat can now mark the current band "resolved":
-- the thread hides from that band and re-surfaces in the NEXT band if the lead still
-- hasn't replied. These two columns hold that state:
--   followup_resolved_at  - when the user clicked Resolved (a lead reply afterwards,
--                            being a newer inbound, auto-invalidates it)
--   followup_resolved_hi  - the resolved band's upper edge in hours (72/120/144/168);
--                            the thread reappears once its age crosses this edge.
-- Both nullable, default null = never resolved (identical to prior behaviour). Read via
-- lib/manual-followups.ts followupResolvedHidden(); written by
-- app/api/conversations/[id]/followup-resolve. Idempotent.
--
-- DEPLOY ORDER: apply this migration BEFORE deploying the code - the Follow-ups queue
-- read selects these columns, so a code deploy that precedes the migration would error.
alter table public.conversations
  add column if not exists followup_resolved_at timestamptz;
alter table public.conversations
  add column if not exists followup_resolved_hi smallint;

-- Teardown:
-- alter table public.conversations drop column if exists followup_resolved_at;
-- alter table public.conversations drop column if exists followup_resolved_hi;
