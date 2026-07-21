-- Request Change: add the "overall" category.
--
-- "overall" is a broad request where the AI decides which of the bot's prompt
-- sections (persona/offers/rebuttals) AND/OR knowledge base the client's ask
-- affects, and proposes edits to each affected part in ONE request. Like
-- offers/rebuttals/other it is TEAM-REVIEWED (never auto-applies), because it can
-- touch the review-gated sections.
--
-- ⚠️ DEPLOY ORDER: apply this migration BEFORE deploying the code. Unlike the
-- column-adds, this widens a CHECK constraint on an existing column — if the new
-- code ships first, a client picking "Overall" would try to insert
-- category='overall' and hit the OLD constraint (500). Migration first, then deploy.
--
-- The original constraint was created inline with the column, so Postgres named it
-- change_requests_category_check. Drop + re-add it with the wider value set.

alter table public.change_requests drop constraint if exists change_requests_category_check;
alter table public.change_requests add constraint change_requests_category_check
  check (category in ('personality','offers','rebuttals','other','overall'));

-- Teardown (revert): any 'overall' rows must be re-categorized or deleted first,
-- otherwise the narrower constraint below fails to validate.
-- alter table public.change_requests drop constraint if exists change_requests_category_check;
-- alter table public.change_requests add constraint change_requests_category_check
--   check (category in ('personality','offers','rebuttals','other'));
