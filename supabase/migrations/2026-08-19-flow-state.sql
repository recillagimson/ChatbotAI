-- Question ledger: a compact, domain-neutral record of which questions THIS
-- business has asked this lead, which the lead actually answered, and which are
-- still owed. Re-derived in full from the recent message window after each reply
-- (lib/flow-state.ts) and injected into the system prompt next to known_facts, so
-- the model stops re-deriving its position in a scripted flow from raw prose on
-- every turn. Null/empty = nothing asked yet. Format is domain-neutral (statuses
-- only); any vocabulary comes from that tenant's own transcript at runtime.
alter table public.conversations
  add column if not exists flow_state text;

-- created_at of the NEWEST message folded into flow_state. Two uses only:
-- (1) rendering the block's own age so the model knows how far behind it is, and
-- (2) the compare-and-swap token on write. It is NOT a "skip these messages"
-- watermark - the extractor always re-reads the same fixed window - so a failed
-- extraction can never strand messages outside every memory layer.
alter table public.conversations
  add column if not exists flow_state_at timestamptz;

-- Teardown:
-- alter table public.conversations drop column if exists flow_state;
-- alter table public.conversations drop column if exists flow_state_at;
