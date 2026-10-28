import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { assetEditPatch } from "@/lib/followup-assets";

/**
 * Editing a Media item: the label, the "When to send" text the AI reads, and the
 * ManyChat flow TikTok starts instead of sending the file. The key, file and kind
 * never change (follow-up steps, keyword replies and KB text find items by key).
 */

describe("assetEditPatch: what Edit may change", () => {
  it("trims the label and when-to-send text; a blank one clears it", () => {
    expect(assetEditPatch({ label: "  Reviews ", description: "" })).toEqual({
      ok: true,
      patch: { label: "Reviews", description: null },
    });
  });

  it("sets or clears the TikTok flow; clearing the flow clears its name", () => {
    expect(assetEditPatch({ tiktok_flow_ns: "content20261028_123456", tiktok_flow_name: " Reviews " })).toEqual({
      ok: true,
      patch: { tiktok_flow_ns: "content20261028_123456", tiktok_flow_name: "Reviews" },
    });
    expect(assetEditPatch({ tiktok_flow_ns: "", tiktok_flow_name: "Reviews" })).toEqual({
      ok: true,
      patch: { tiktok_flow_ns: null, tiktok_flow_name: null },
    });
  });

  it("never changes the key, file, owner or kind", () => {
    const r = assetEditPatch({
      label: "L",
      key: "other",
      url: "https://elsewhere.example/x.png",
      storage_path: "someone/x.png",
      user_id: "u2",
      kind: "video",
    });
    expect(r).toEqual({ ok: true, patch: { label: "L" } });
  });

  it("refuses a malformed flow id, an over-long field, or nothing to change", () => {
    expect(assetEditPatch({ tiktok_flow_ns: "content 1; drop" }).ok).toBe(false);
    expect(assetEditPatch({ label: "x".repeat(201) }).ok).toBe(false);
    expect(assetEditPatch({ description: "x".repeat(2001) }).ok).toBe(false);
    expect(assetEditPatch({ label: 5 }).ok).toBe(false);
    expect(assetEditPatch({}).ok).toBe(false);
  });
});

// ── The route ──────────────────────────────────────────────────────────────

const ID = "4f1e2d3c-4b5a-4968-8776-655443322110";
let access: Record<string, unknown>;
let updates: { patch: Record<string, unknown>; filters: [string, unknown][] }[];
let row: Record<string, unknown> | null;
let dbError: { code?: string; message?: string } | null;

function db() {
  return {
    from: (table: string) => {
      expect(table).toBe("followup_assets");
      const filters: [string, unknown][] = [];
      const chain: Record<string, unknown> = {
        update: (patch: Record<string, unknown>) => {
          updates.push({ patch, filters });
          return chain;
        },
        eq: (col: string, val: unknown) => {
          filters.push([col, val]);
          return chain;
        },
        select: () => chain,
        maybeSingle: async () => ({ data: dbError ? null : row, error: dbError }),
      };
      return chain;
    },
  };
}

vi.mock("@/lib/chatbot-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/chatbot-access")>()),
  resolveChatbotAccess: async () => access,
}));

let PATCH: (typeof import("@/app/api/followup-assets/route"))["PATCH"];
beforeAll(async () => {
  ({ PATCH } = await import("@/app/api/followup-assets/route"));
}, 120_000);

beforeEach(() => {
  access = { ok: true, db: db(), superadmin: false, userId: "owner-1" };
  updates = [];
  row = { id: ID, key: "reviews", label: "Reviews" };
  dbError = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const patch = async (body: Record<string, unknown>) => {
  const res = await PATCH(
    new NextRequest("http://localhost/api/followup-assets", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
};

describe("PATCH /api/followup-assets", () => {
  it("saves only the editable fields, on the caller's own item", async () => {
    const { status, json } = await patch({ id: ID, label: "Client reviews", key: "hijack", tiktok_flow_ns: "content_1" });
    expect(status).toBe(200);
    expect(json.asset).toEqual(row);
    expect(updates).toEqual([
      {
        patch: { label: "Client reviews", tiktok_flow_ns: "content_1", tiktok_flow_name: null },
        filters: [["id", ID], ["user_id", "owner-1"]],
      },
    ]);
  });

  it("a superadmin edits any client's item (no owner filter)", async () => {
    access = { ...access, superadmin: true };
    await patch({ id: ID, label: "x" });
    expect(updates[0].filters).toEqual([["id", ID]]);
  });

  it("404s an item that isn't the caller's", async () => {
    row = null;
    expect((await patch({ id: ID, label: "x" })).status).toBe(404);
  });

  it("refuses a bad edit before touching the database", async () => {
    expect((await patch({ id: ID, tiktok_flow_ns: "no spaces allowed" })).status).toBe(400);
    expect((await patch({ label: "x" })).status).toBe(400);
    expect(updates).toEqual([]);
  });

  it("says what to do when the TikTok flow columns aren't in the database yet", async () => {
    // What PostgREST returns for an UPDATE naming a column the table doesn't have.
    dbError = {
      code: "PGRST204",
      message: "Could not find the 'tiktok_flow_name' column of 'followup_assets' in the schema cache",
    };
    const { status, json } = await patch({ id: ID, tiktok_flow_ns: "content_1" });
    expect(status).toBe(500);
    expect(String(json.error)).toMatch(/database update/i);
  });

  it("refuses an id that isn't one, before touching the database", async () => {
    expect((await patch({ id: "a1", label: "x" })).status).toBe(400);
    expect(updates).toEqual([]);
  });

  it("401 without a session", async () => {
    access = { ok: false };
    expect((await patch({ id: ID, label: "x" })).status).toBe(401);
  });
});
