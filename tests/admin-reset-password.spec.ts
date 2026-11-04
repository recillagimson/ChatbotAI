import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// An admin can set a locked-out client's password. These pin that only a
// superadmin gets through, that the password is validated, and that the write
// goes to the Supabase Auth admin API for THAT user.

const requireSuperadmin = vi.fn();
vi.mock("@/lib/admin", () => ({ requireSuperadmin: () => requireSuperadmin() }));

const updateUserById = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ auth: { admin: { updateUserById } } }),
}));

const { POST } = await import("@/app/api/admin/reset-password/route");

const USER = "11111111-1111-4111-8111-111111111111";

function req(body: unknown) {
  return new NextRequest("https://example.com/api/admin/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireSuperadmin.mockReset();
  updateUserById.mockReset();
});

describe("POST /api/admin/reset-password", () => {
  it("refuses a non-superadmin", async () => {
    requireSuperadmin.mockResolvedValue(null);
    const res = await POST(req({ userId: USER, password: "longenough1" }));
    expect(res.status).toBe(403);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("rejects a short password", async () => {
    requireSuperadmin.mockResolvedValue({ id: "admin", email: null });
    const res = await POST(req({ userId: USER, password: "short" }));
    expect(res.status).toBe(400);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("rejects a bad user id", async () => {
    requireSuperadmin.mockResolvedValue({ id: "admin", email: null });
    const res = await POST(req({ userId: "nope", password: "longenough1" }));
    expect(res.status).toBe(400);
  });

  it("sets the password for that user", async () => {
    requireSuperadmin.mockResolvedValue({ id: "admin", email: null });
    updateUserById.mockResolvedValue({ data: {}, error: null });
    const res = await POST(req({ userId: USER, password: "longenough1" }));
    expect(res.status).toBe(200);
    expect(updateUserById).toHaveBeenCalledWith(USER, { password: "longenough1" });
  });

  it("reports a missing user as 404", async () => {
    requireSuperadmin.mockResolvedValue({ id: "admin", email: null });
    updateUserById.mockResolvedValue({ data: null, error: { message: "User not found" } });
    const res = await POST(req({ userId: USER, password: "longenough1" }));
    expect(res.status).toBe(404);
  });
});
