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
