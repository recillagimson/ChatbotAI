import { describe, it, expect } from "vitest";
import { decideKbOwner } from "@/lib/kb-access";

/**
 * Pure authorization decision for knowledge-base writes. The three modes decide both WHO
 * the row is attributed to and WHICH Supabase client the route uses:
 *  - self   -> acting user owns it (normal user, or an admin impersonating the owner); RLS client
 *  - admin  -> a superadmin acting on ANOTHER user's chatbot/entry; service client, stamp owner
 *  - forbidden -> not owner + not admin, or target missing; route returns 404 (no existence leak)
 */
describe("decideKbOwner", () => {
  const me = "user-1";

  it("self: acting user owns the target (superadmin flag is irrelevant)", () => {
    expect(
      decideKbOwner({ currentUserId: me, ownerId: me, isSuperadmin: false, impersonating: false })
    ).toEqual({ mode: "self", ownerId: me });
    // Even a superadmin editing their OWN chatbot is "self", never "admin".
    expect(
      decideKbOwner({ currentUserId: me, ownerId: me, isSuperadmin: true, impersonating: false })
    ).toEqual({ mode: "self", ownerId: me });
  });

  it("admin: a non-impersonating superadmin acting on another user's target stamps the OWNER", () => {
    expect(
      decideKbOwner({
        currentUserId: "admin-1",
        ownerId: "client-9",
        isSuperadmin: true,
        impersonating: false,
      })
    ).toEqual({ mode: "admin", ownerId: "client-9" });
  });

  it("forbidden: a superadmin IMPERSONATING may not cross into a non-impersonated client", () => {
    // Viewing as client-A (currentUserId), a request for client-B's target must NOT become
    // an admin write - impersonation is a hard per-client boundary.
    expect(
      decideKbOwner({
        currentUserId: "client-A",
        ownerId: "client-B",
        isSuperadmin: true,
        impersonating: true,
      })
    ).toEqual({ mode: "forbidden" });
  });

  it("forbidden: a non-superadmin acting on someone else's target", () => {
    expect(
      decideKbOwner({ currentUserId: me, ownerId: "client-9", isSuperadmin: false, impersonating: false })
    ).toEqual({ mode: "forbidden" });
  });

  it("forbidden: a missing target (null owner), even for a superadmin - never leaks existence", () => {
    expect(
      decideKbOwner({ currentUserId: me, ownerId: null, isSuperadmin: false, impersonating: false })
    ).toEqual({ mode: "forbidden" });
    expect(
      decideKbOwner({ currentUserId: "admin-1", ownerId: null, isSuperadmin: true, impersonating: false })
    ).toEqual({ mode: "forbidden" });
  });
});
