-- ===========================================================================
-- Admin comp-access grant (2026-07-06)
-- ===========================================================================
-- Superadmins can grant an existing account free access for X days/months (a
-- comp/trial that bypasses Stripe). A grant is the account's subscriptions row
-- set to status='trialing' with comp_expires_at in the future; access is
-- enforced at CHECK TIME by lib/access.ts hasActiveAccess() (active/trialing AND
-- not past comp_expires_at) — there is no scheduled sweep. Real Stripe subs have
-- comp_expires_at NULL and are unaffected. comp_granted_by/at/note record the
-- last grant for the admin UI.
--
-- These columns are READ by the access checks (ManyChat webhook, follow-up cron,
-- dashboard, billing), so an unknown column would error those queries. Apply this
-- BEFORE deploying the code that uses it.
--
-- Apply in the Supabase SQL editor. Idempotent.

alter table public.subscriptions
  add column if not exists comp_expires_at timestamptz,
  add column if not exists comp_granted_at timestamptz,
  add column if not exists comp_granted_by uuid references public.profiles(id),
  add column if not exists comp_note text;

-- Teardown:
-- alter table public.subscriptions
--   drop column if exists comp_expires_at,
--   drop column if exists comp_granted_at,
--   drop column if exists comp_granted_by,
--   drop column if exists comp_note;
