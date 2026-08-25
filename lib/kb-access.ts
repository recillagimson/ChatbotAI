/**
 * Who a knowledge-base write should be attributed to, and whether it is a superadmin
 * acting on ANOTHER user's chatbot.
 *
 * The KB write routes are normally scoped to the acting user (impersonation-aware): the
 * lead uploads/edits their own KB, and an admin "viewing as" a client acts as that client.
 * This adds one more case - a superadmin editing a client's KB straight from the /admin
 * detail page (NOT impersonating) - which must stamp the CHATBOT OWNER's id, not the admin's,
 * and write via the service client (the "own kb" RLS won't match, and kb_chunks has no admin
 * overlay so indexing already uses the service client anyway).
 *
 * Pure + unit-tested. The Supabase lookups and the superadmin check live in the server
 * resolvers (lib/kb-access-server.ts) that feed this.
 */
export type KbOwnerDecision =
  /** The acting user owns the target (normal user, or an admin impersonating the owner). */
  | { mode: "self"; ownerId: string }
  /** A superadmin acting on another user's chatbot/entry - stamp the owner, use service client. */
  | { mode: "admin"; ownerId: string }
  /** Not the owner and not a superadmin, or the target does not exist -> 404 (don't leak). */
  | { mode: "forbidden" };

export function decideKbOwner(opts: {
  /** The acting user (impersonation-aware): the client under "view as", else the real user. */
  currentUserId: string;
  /** The owner of the target chatbot/entry, or null when it does not exist. */
  ownerId: string | null;
  /** Whether the REAL user is a superadmin (getRealUser-based; never the impersonated id). */
  isSuperadmin: boolean;
  /**
   * Whether the session is currently impersonating a client ("View as"). Cross-tenant admin
   * writes are refused while impersonating: a superadmin viewing as client A must act ONLY as
   * A (self mode), never reach into a different client's KB. Without this, a superadmin is
   * always a superadmin by getRealUser(), so a stale form or the browser-wide view-as cookie
   * could turn an A-scoped session into a write on B - breaking the per-client boundary.
   */
  impersonating: boolean;
}): KbOwnerDecision {
  const { currentUserId, ownerId, isSuperadmin, impersonating } = opts;
  if (!ownerId) return { mode: "forbidden" };
  if (ownerId === currentUserId) return { mode: "self", ownerId };
  if (isSuperadmin && !impersonating) return { mode: "admin", ownerId };
  return { mode: "forbidden" };
}
