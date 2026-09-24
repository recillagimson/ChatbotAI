-- =============================================================================
-- 2026-09-25  RLS: a tenant may only write rows for a chatbot it OWNS
-- =============================================================================
--
-- THE GAP (verified on prod 2026-09-25, read-only)
--
-- The owner write policies on three tables check only that the new row is
-- stamped with the writer's own user_id. They never check that the row's
-- chatbot_id belongs to that same user:
--
--   knowledge_base   "own kb"                 with check  (auth.uid() = user_id)
--   followup_assets  "own followup_assets"    with check  (auth.uid() = user_id)
--   conversations    "own conversations"      with check  (auth.uid() = user_id)
--
-- So any signed-in tenant B who learns tenant A's chatbot uuid can INSERT a row
-- stamped user_id = B but chatbot_id = A's bot. Nothing else stops it: there is
-- no trigger on any of these tables, and the chatbot_id foreign key checks only
-- that the bot EXISTS, not who owns it. Consequences:
--
--   knowledge_base   B plants content that A's bot reads at reply time (the
--                    webhook reads KB by chatbot_id on the service client), so
--                    B can inject instructions into A's bot. A cannot see or
--                    delete the row, because A's dashboard filters by user_id.
--   followup_assets  same shape: B plants media A's bot may send.
--   conversations    B pre-creates a thread for A's bot and a subscriber that
--                    has not messaged A yet. The webhook reuses an existing
--                    (chatbot_id, manychat_subscriber_id) row as-is and never
--                    re-owns it, so that lead's DMs to A are then written into
--                    B's conversation, where B can read them through "own
--                    messages", and B can insert fake history that feeds A's
--                    bot prompt. The thread never appears in A's dashboard.
--
-- Exploitability is low (B needs A's chatbot uuid, and for conversations a
-- subscriber id not yet used on A's bot), but the outcome is cross-tenant read
-- of DMs and prompt injection, so it is worth closing.
--
-- No evidence it has ever been used: on 2026-09-25 every row in all four
-- tables had user_id equal to its chatbot's owner, and none was orphaned
-- (knowledge_base 30, followup_assets 58, conversations 27,727, kb_chunks 110).
--
-- THE FIX
--
-- Add the chatbot-ownership clause to WITH CHECK. This is the exact pattern
-- kb_chunks "own kb chunks" already uses in production, so it is proven here:
--
--   (select auth.uid()) = user_id
--   and chatbot_id in (select c.id from public.chatbots c
--                      where c.user_id = (select auth.uid()))
--
-- Only WITH CHECK changes. USING (what a tenant can read, update or delete) is
-- untouched, so no tenant loses sight of anything. chatbot_id is NOT NULL on
-- all three tables, so no legitimate row can fail the IN check by being null.
--
-- WHO IS UNAFFECTED
--   - Owners writing to their own bots (the knowledge-base page, follow-up
--     assets, conversation actions, the welcome form) pass the new clause.
--   - Superadmins, including under "View as client", pass through the separate
--     permissive "admin all ..." policy on each table, which is unchanged.
--   - The ManyChat webhook, crons and every server route using the service
--     role bypass RLS entirely, so the reply hot path is not touched.
--
-- messages needs no change: "own messages" has no WITH CHECK, so its USING
-- applies, and that already requires the conversation to be owned by the
-- writer. With conversations closed, a tenant can only own conversations on
-- its own bots, which closes the messages route as well.
--
-- LOCKING: ALTER POLICY takes a brief ACCESS EXCLUSIVE lock on each table.
-- conversations is written continuously by the webhook, so lock_timeout makes
-- this fail fast rather than queue behind a long transaction and stall
-- traffic. If it times out, nothing has changed (it is one transaction); just
-- run it again.
--
-- HOW TO RUN: paste the whole file into the SQL editor and run it once. It is
-- one transaction with no CONCURRENTLY, so a single block is correct. Then run
-- VERIFY at the bottom.
-- =============================================================================

begin;

set local lock_timeout = '3s';
set local statement_timeout = '30s';

alter policy "own kb" on public.knowledge_base
  with check (
    (select auth.uid()) = user_id
    and chatbot_id in (
      select c.id from public.chatbots c where c.user_id = (select auth.uid())
    )
  );

alter policy "own followup_assets" on public.followup_assets
  with check (
    (select auth.uid()) = user_id
    and chatbot_id in (
      select c.id from public.chatbots c where c.user_id = (select auth.uid())
    )
  );

alter policy "own conversations" on public.conversations
  with check (
    (select auth.uid()) = user_id
    and chatbot_id in (
      select c.id from public.chatbots c where c.user_id = (select auth.uid())
    )
  );

-- feedback has the same user_id-only check on its INSERT policy. Far lower
-- stakes than the three above: feedback feeds no bot prompt and no client's
-- dashboard, and a planted chatbot_id only mislabels which bot the superadmin
-- triage page shows next to it. Closed here anyway for consistency. UNLIKE the
-- tables above, chatbot_id is NULLABLE here on purpose: general feedback about
-- the product has no bot (1 of the 3 rows on 2026-09-25), so null must pass.
alter policy "fb owner insert" on public.feedback
  with check (
    (select auth.uid()) = user_id
    and (
      chatbot_id is null
      or chatbot_id in (
        select c.id from public.chatbots c where c.user_id = (select auth.uid())
      )
    )
  );

commit;


-- =============================================================================
-- VERIFY (read-only)
-- =============================================================================
--
-- V1. All five owner policies now carry the ownership clause (kb_chunks already
--     did). Expect 5 rows, every one with has_ownership_check = true, and USING
--     unchanged.
-- select tablename, policyname, qual as using_expr,
--        with_check ~* 'chatbot_id\s+IN' as has_ownership_check
--   from pg_policies
--  where schemaname = 'public'
--    and (tablename, policyname) in (('knowledge_base','own kb'),
--                                    ('followup_assets','own followup_assets'),
--                                    ('conversations','own conversations'),
--                                    ('feedback','fb owner insert'),
--                                    ('kb_chunks','own kb chunks'))
--  order by tablename;
--
-- V2. The block works. As a CLIENT, try to plant a KB row on ANOTHER tenant's
--     bot inside a transaction that is rolled back. Expect ERROR 42501 "new row
--     violates row-level security policy". Replace the two uuids.
-- begin;
-- set local role authenticated;
-- set local request.jwt.claims = '{"sub":"<CLIENT_UUID>","role":"authenticated"}';
-- insert into public.knowledge_base (user_id, chatbot_id, title, content, source_type)
-- values ('<CLIENT_UUID>', '<ANOTHER_TENANTS_CHATBOT_UUID>', 'probe', 'probe', 'text');
-- rollback;
--
-- V3. Legitimate writes still work. Same transaction shape, but on the
--     client's OWN bot: expect the insert to succeed (then it is rolled back).
-- begin;
-- set local role authenticated;
-- set local request.jwt.claims = '{"sub":"<CLIENT_UUID>","role":"authenticated"}';
-- insert into public.knowledge_base (user_id, chatbot_id, title, content, source_type)
-- values ('<CLIENT_UUID>', '<THAT_CLIENTS_OWN_CHATBOT_UUID>', 'probe', 'probe', 'text');
-- rollback;


-- =============================================================================
-- ROLLBACK (restores today's exact WITH CHECK expressions)
-- =============================================================================
-- begin;
-- set local lock_timeout = '3s';
-- alter policy "own kb"               on public.knowledge_base  with check ((select auth.uid()) = user_id);
-- alter policy "own followup_assets"  on public.followup_assets with check ((select auth.uid()) = user_id);
-- alter policy "own conversations"    on public.conversations   with check ((select auth.uid()) = user_id);
-- alter policy "fb owner insert"      on public.feedback        with check ((select auth.uid()) = user_id);
-- commit;
