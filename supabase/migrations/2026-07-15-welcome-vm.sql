-- SpeedSettr owns the first-message greeting decision. When welcome_enabled and a
-- welcome_flow_ns is set, a brand-new contact whose opener is a bare greeting or one
-- of welcome_keywords (and carries no media) triggers the native ManyChat Welcome VM
-- flow instead of the AI; a substantive opener (image/detail) goes to the AI.
-- conversations.welcomed_at marks the decision as made (VM sent OR first msg -> AI) so
-- the greeting is never re-sent. Default off: an un-set-up bot behaves exactly as today.
alter table public.chatbots
  add column if not exists welcome_enabled boolean not null default false,
  add column if not exists welcome_flow_ns text,
  add column if not exists welcome_flow_name text,
  add column if not exists welcome_keywords jsonb not null default '[]'::jsonb;

-- welcomed_at is created + backfilled together, inside one guard, so the backfill
-- happens ONLY when the column is first added. Every conversation that predates this
-- column is an EXISTING contact, not a new one - mark it resolved so it can never be
-- mistaken for a brand-new contact. (A plain unconditional backfill would wrongly
-- resolve genuinely-new contacts if the migration were ever re-run.)
-- NOTE: this covers only rows predating the column. This migration runs at deploy while
-- welcome_enabled is still false for every bot, so conversations created between deploy
-- and the day a tenant flips the switch would also read NULL. That second seam is closed
-- at the ENABLE transition in components/dashboard/welcome-form.tsx, which backfills the
-- bot's remaining NULL rows before setting welcome_enabled = true. Both are required for
-- welcomed_at IS NULL to reliably mean "brand new".
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conversations'
      and column_name = 'welcomed_at'
  ) then
    alter table public.conversations add column welcomed_at timestamptz;
    update public.conversations set welcomed_at = now();
  end if;
end $$;
