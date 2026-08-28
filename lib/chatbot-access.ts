// lib/chatbot-access.ts
// Authorize the current caller to operate on ONE chatbot's API routes, for either
// the bot's OWNER or a SUPERADMIN driving the admin panel. Centralizes the pattern
// first written inline in app/api/chatbots/[id]/reindex/route.ts so the ~5 owner-
// scoped write routes the admin per-bot tabs depend on share one audited code path.
//
// Two callers:
//   - OWNER: the client on their own dashboard, or an admin under "view as" (where
//     getCurrentUser() resolves to the client). Served their RLS client; every
//     chatbots query is additionally scoped by user_id (defense in depth, unchanged
//     from the original owner-only routes).
//   - SUPERADMIN from /admin (NOT impersonating): getCurrentUser() is the admin, who
//     does not own the bot, so an owner-scoped filter would 404. Authorized via
//     requireSuperadmin() (keys off the REAL user) and served the service client
//     (RLS-exempt), scoped by chatbot id alone.
import { createClient, createServiceClient, getCurrentUser } from "@/lib/supabase/server";
import { requireSuperadmin } from "@/lib/admin";

type Db = Awaited<ReturnType<typeof createClient>>;

export type ChatbotAccess =
  | { ok: true; db: Db; superadmin: boolean; userId: string }
  | { ok: false };

/**
 * Resolve the DB client authorized for the current caller. `db` is the caller's RLS
 * client (owner) or the service client (superadmin) - cast to one type so call sites
 * stay simple; both expose the same query API. `ok:false` => 401 (no session).
 */
export async function resolveChatbotAccess(): Promise<ChatbotAccess> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const superadmin = !!(await requireSuperadmin());
  const db = (superadmin ? createServiceClient() : await createClient()) as Db;
  return { ok: true, db, superadmin, userId: user.id };
}

/**
 * Add the owner scope (`.eq("user_id", …)`) to a chatbots query for a non-superadmin,
 * leaving a superadmin's service-client query matched by id alone. Apply BEFORE the
 * terminal (.maybeSingle()/.single()/await) so the filter takes effect.
 */
export function ownerScope<Q>(q: Q, access: { superadmin: boolean; userId: string }): Q {
  if (access.superadmin) return q;
  return (q as unknown as { eq(col: string, val: string): Q }).eq("user_id", access.userId);
}
