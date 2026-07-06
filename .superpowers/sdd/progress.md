=== Feature: admin View-as-client impersonation ===
base: 6bec08d44ee2fbe52d613393a537dfdd397611b5
Task 1: complete (lib/impersonation.ts resolver + cookie; server.ts split getRealUser/effective getCurrentUser; tsc clean)
Task 2: complete (requireSuperadmin + admin layout + dashboard layout use getRealUser)
Task 3: complete (POST/DELETE /api/admin/view-as, superadmin-gated)
Task 4: complete (ImpersonationBanner + dashboard layout banner; Sidebar impersonating prop scopes nav + hides signout)
Task 5: complete (ViewAsButton; clients list Actions column + client detail panel button; tsc clean)
Task 5: complete (ViewAsButton on clients list + client detail)
Task 6: complete (new-chatbot server page + NewChatbotForm ownerId from effective user)
Task 7: complete (stripe checkout+portal refuse when impersonating)
Task 8: complete (schema.sql admin upload write/update storage policies)
FULL tsc clean
Final fixes: route-gate /settings + /billing redirect when impersonating; view-as blocks impersonating another superadmin; tsc clean.
Final: whole-branch review (opus) APPROVED, 0 critical/important. Feature complete.

=== Feature: anti-prompt-extraction shield ===
base: 4e3bba9 (working-tree edits, owner commits manually)
Task 1: complete (lib/extraction-detect.ts + test-extraction-match 55/55; 3 adversarial review rounds, APPROVED; minors: repeat-the-above→WEAK, above-instructions→HARD, doc drift fixed)
Task 2: complete (CONFIDENTIALITY final block all 3 modes incl. legacy; test-systemprompt 62/62)
Task 3: complete (webhook 6b-shield before 6c; securityInstruction || keywordInstruction; mid-burst steer)
Task 4: complete (2026-07-06-prompt-shield.sql + schema mirror + Conversation types)
Task 5: complete (destructive Flagged badge inbox row + detail header)
Task 6: complete (API.md extraction_blocked + CLAUDE.md gotcha 14)
Deferred minors for final review: regex caching (detector runs ~60 regexes/msg); adjectival-prompt formal register accepted; original prompt/your config vertical collisions accepted
Final: whole-branch review (fable) APPROVED, 0 critical/important; minors 1/3/5 fixed (AI-disclosure scoping, auto-pause doc wording, awaited best-effort writes); gates 55+62+29+30 green, tsc clean. Feature complete; owner applies 2026-07-06-prompt-shield.sql + commits.

=== Feature: self-service pause/resume (stopmessage/resumemessage) ===
Task 1-5 complete (lib/user-controls.ts + test 21/21; user_muted_at column + migration + schema mirror + type; webhook gate 6-mute after human-takeover before rate-limit + post-debounce stand-down; Muted badge inbox+detail + owner un-mute button; API.md + CLAUDE.md gotcha 15)
Review (fable) found 2 real bugs: (1) CRITICAL follow-up cron drips to muted leads -> fixed with .is(user_muted_at,null) filter; (2) IMPORTANT 30s dedup swallows control words -> fixed with !detectUserControl guard at 3c; plus race hardening: stop stamps reply_claimed_for to discard in-flight burst run, resume clears it.
Gates: user-controls 21/21, debounce 30/30, keyword 29/29, extraction 55/55, systemprompt 62/62, tsc clean. Owner applies 2026-07-06-user-mute.sql (also required by the cron filter) + commits.
Re-review (fable) APPROVED after 3 fixes; applied 2 optional cleanups (accurate dedup comment, un-mute button clears reply_claimed_for). Final gates green, tsc clean. Feature complete; owner applies 2026-07-06-user-mute.sql BEFORE deploy (cron filter is fail-closed) + commits.

=== Feature: keyword-only reply mode (keyword gate) ===
Complete (chatbots.keyword_gate_enabled column + migration + schema mirror + type; webhook 6-gate hoists keywordGroup above trivial/shield, silent on non-match; keyword-triggers-form toggle + footgun warning; API.md keyword_gate_blocked + CLAUDE.md gotcha 16; test-systemprompt fixture updated)
Review (fable) found the same-class bug as user-mute: followup drip ignored the gate -> fixed (cron skips gated bots conversations with empty keyword_fired). Also corrected false deploy-safety claim (save+cron require the column). Backlog fold-in accepted+documented.
Gates: keyword 29/29, extraction 55/55, systemprompt 62/62, user-controls 21/21, debounce 30/30, tsc clean. Owner applies 2026-07-06-keyword-gate.sql BEFORE deploy + commits.
Re-review (fable) APPROVED; documented the safe-direction message-mode edge in the cron comment. Feature complete; owner applies 2026-07-06-keyword-gate.sql BEFORE deploy + commits.
