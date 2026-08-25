import { createServiceClient, getCurrentUser, getRealUser } from "@/lib/supabase/server";
import { requireSuperadmin } from "@/lib/admin";
import { decideKbOwner, type KbOwnerDecision } from "@/lib/kb-access";

/**
 * Server-side authorization + owner resolution for a knowledge-base write. See
 * [lib/kb-access.ts] for the pure decision this wraps.
 *
 * `admin: true` means a superadmin is acting on another user's chatbot/entry (from the
 * /admin detail page, NOT impersonating): the route must write with the SERVICE client and
 * stamp `ownerId`. `admin: false` (self, incl. impersonation) means the route writes under
 * the caller's own RLS as today. `forbidden` maps to 404 so a non-admin can't probe which
 * chatbot ids exist.
 */
export type KbWriteAccess =
  | { ok: true; ownerId: string; admin: boolean }
  | { ok: false; status: 401 | 404 };

/**
 * Resolve the cross-tenant flags only when they can matter (acting user isn't the owner).
 * `impersonating` = the session is "viewing as" a client (real user differs from the acting
 * user); a superadmin is only granted admin mode when NOT impersonating, so a view-as session
 * can never reach outside the impersonated client's own data.
 */
async function decide(currentUserId: string, ownerId: string | null): Promise<KbWriteAccess> {
  let isSuperadmin = false;
  let impersonating = false;
  if (ownerId && ownerId !== currentUserId) {
    const realUser = await getRealUser();
    impersonating = !!realUser && realUser.id !== currentUserId;
    // Skip the superadmin round-trip entirely while impersonating - admin mode is off then.
    isSuperadmin = !impersonating && !!(await requireSuperadmin());
  }
  const decision: KbOwnerDecision = decideKbOwner({
    currentUserId,
    ownerId,
    isSuperadmin,
    impersonating,
  });
  if (decision.mode === "forbidden") return { ok: false, status: 404 };
  return { ok: true, ownerId: decision.ownerId, admin: decision.mode === "admin" };
}

/**
 * Authorize a KB write that targets a chatbot (create/upload) and resolve the owner id to
 * stamp. The chatbot owner is read with the service client so resolution never depends on
 * the acting user's RLS (an admin acting on another user's chatbot has no RLS view of it via
 * the anon client's own policy, only via the admin overlay).
 */
export async function resolveKbWriteByChatbot(chatbotId: string): Promise<KbWriteAccess> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, status: 401 };
  const svc = createServiceClient();
  const { data } = await svc
    .from("chatbots")
    .select("user_id")
    .eq("id", chatbotId)
    .maybeSingle();
  return decide(user.id, (data?.user_id as string | undefined) ?? null);
}

/** The entry a KB edit targets, loaded once for both authorization and re-indexing. */
export interface KbEntryRow {
  id: string;
  chatbot_id: string;
  user_id: string;
  content: string;
}

/**
 * Authorize a KB write that targets an existing entry (edit) and return the entry so the
 * caller can re-index without a second lookup. The entry is read with the service client so
 * an admin acting on another user's entry can still resolve it.
 */
export async function resolveKbWriteByEntry(
  entryId: string
): Promise<
  | { ok: true; ownerId: string; admin: boolean; entry: KbEntryRow }
  | { ok: false; status: 401 | 404 }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, status: 401 };
  const svc = createServiceClient();
  const { data: entry } = await svc
    .from("knowledge_base")
    .select("id, chatbot_id, user_id, content")
    .eq("id", entryId)
    .maybeSingle();
  const access = await decide(user.id, (entry?.user_id as string | undefined) ?? null);
  if (!access.ok) return access;
  return { ok: true, ownerId: access.ownerId, admin: access.admin, entry: entry as KbEntryRow };
}
