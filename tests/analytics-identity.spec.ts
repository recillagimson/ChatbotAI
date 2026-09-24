import { describe, it, expect, vi } from "vitest";
import { getAnalyticsOverview, getStageConversations } from "@/lib/analytics";
import { callArgs, code, read, sourceFiles } from "./helpers/source";

/**
 * Phase 3, 03-01: every analytics report is for the EFFECTIVE user.
 *
 * The bug this guards (verified on prod 2026-09-25): analytics_overview and
 * analytics_stage_conversations scoped by auth.uid(), the JWT user. Under "View
 * as client" the JWT is the superadmin's, so /statistics showed the SUPERADMIN'S
 * OWN account (2,154 conversations) instead of the client's (439); bot-scoped
 * reports read zero; the stage CSV listed the superadmin's own contacts; a bot's
 * Overview tab showed the superadmin's response time and delivery failures.
 *
 * The fix passes p_user_id, which the database honours only for self or a
 * superadmin (supabase/migrations/2026-09-25-analytics-effective-user.sql).
 * These tests pin the app half of that contract.
 */

type Rpc = { name: string; args: Record<string, unknown> };

function fakeSupabase(data: unknown = {}) {
  const calls: Rpc[] = [];
  const client = {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return { data, error: null };
    }),
  };
  // The helpers only ever call .rpc, so a one-method fake stands in for the client.
  return { client: client as unknown as Parameters<typeof getAnalyticsOverview>[0], calls };
}

describe("the analytics helpers forward the effective user as p_user_id", () => {
  it("getAnalyticsOverview sends p_user_id and leaves the other args unchanged", async () => {
    const { client, calls } = fakeSupabase();
    await getAnalyticsOverview(client, {
      from: "2026-08-25T00:00:00.000Z",
      to: "2026-09-24T00:00:00.000Z",
      chatbotId: "bot-1",
      userId: "user-1",
    });
    expect(calls).toEqual([
      {
        name: "analytics_overview",
        args: {
          p_from: "2026-08-25T00:00:00.000Z",
          p_to: "2026-09-24T00:00:00.000Z",
          p_chatbot_id: "bot-1",
          p_user_id: "user-1",
        },
      },
    ]);
  });

  it("getStageConversations sends p_user_id and leaves the other args unchanged", async () => {
    const { client, calls } = fakeSupabase([]);
    await getStageConversations(client, {
      stage: "entry",
      from: "2026-08-25T00:00:00.000Z",
      to: "2026-09-24T00:00:00.000Z",
      chatbotId: null,
      limit: 8,
      offset: 16,
      userId: "user-1",
    });
    expect(calls[0]).toEqual({
      name: "analytics_stage_conversations",
      args: {
        p_stage: "entry",
        p_from: "2026-08-25T00:00:00.000Z",
        p_to: "2026-09-24T00:00:00.000Z",
        p_chatbot_id: null,
        p_limit: 8,
        p_offset: 16,
        p_user_id: "user-1",
      },
    });
  });
});

describe("no analytics call can forget the identity", () => {
  const lib = code("lib/analytics.ts");

  it("userId is REQUIRED in both option types, not optional", () => {
    // Making it optional again would let a new call site silently fall back to
    // the JWT user, which is exactly the bug. Required means tsc refuses it.
    const overviewSig = lib.slice(lib.indexOf("export async function getAnalyticsOverview("));
    const stageSig = lib.slice(lib.indexOf("export async function getStageConversations("));
    for (const [name, sig] of [
      ["getAnalyticsOverview", overviewSig],
      ["getStageConversations", stageSig],
    ] as const) {
      const opts = sig.slice(0, sig.indexOf("): Promise<"));
      expect(opts, `${name} must declare userId`).toMatch(/\buserId\s*:\s*string\b/);
      expect(opts, `${name} must not make userId optional`).not.toMatch(/\buserId\s*\?\s*:/);
    }
  });

  it("both helpers put opts.userId on the RPC as p_user_id", () => {
    expect(lib.match(/p_user_id:\s*opts\.userId/g) ?? []).toHaveLength(2);
  });

  it("every call site in the app passes userId", () => {
    const offenders: string[] = [];
    let total = 0;
    for (const file of sourceFiles()) {
      if (file === "lib/analytics.ts") continue;
      const src = code(file);
      for (const fn of ["getAnalyticsOverview", "getStageConversations"]) {
        for (const args of callArgs(src, fn)) {
          total++;
          if (!/\buserId\b/.test(args)) offenders.push(`${file}: ${fn}(${args.slice(0, 60)}...)`);
        }
      }
    }
    // There are 8 today. Not pinned exactly: a new call site is fine, as long as
    // it passes an identity.
    expect(total).toBeGreaterThanOrEqual(8);
    expect(offenders).toEqual([]);
  });
});

describe("the migration keeps the guard", () => {
  // The executable SQL only: `--` comments hold the VERIFY and ROLLBACK blocks,
  // and ROLLBACK deliberately restores the old auth.uid() bodies.
  const sql = read("supabase/migrations/2026-09-25-analytics-effective-user.sql")
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

  it("the guard honours p_user_id only for self or a superadmin, and raises 42501 otherwise", () => {
    const guard = sql.slice(
      sql.indexOf("create or replace function public.analytics_scope_uid("),
      sql.indexOf("revoke all on function public.analytics_scope_uid(")
    );
    expect(guard).toMatch(/if p_user_id is null or p_user_id = v_uid then\s+return v_uid;/);
    expect(guard).toMatch(/if public\.is_superadmin\(\) then\s+return p_user_id;/);
    expect(guard).toMatch(/cannot report on another account' using errcode = '42501'/);
    // Not security definer: RLS must keep applying underneath the guard.
    expect(guard).not.toMatch(/security\s+definer/i);
  });

  it("both functions scope by the guard, never by bare auth.uid()", () => {
    expect(sql.match(/analytics_scope_uid\(p_user_id\)/g) ?? []).toHaveLength(4);
    // Everything after the guard's own grant is the two function definitions.
    // Anchored on the grant (not on DROP wording, which could become
    // "drop function if exists"), and the anchor is asserted, so a rewrite can
    // never turn this into a check of an empty string.
    const anchor = "grant execute on function public.analytics_scope_uid(uuid)";
    const at = sql.indexOf(anchor);
    expect(at, "guard grant line not found").toBeGreaterThan(-1);
    const bodies = sql.slice(at + anchor.length);
    expect(bodies).toMatch(/create function public\.analytics_overview\(/);
    expect(bodies).toMatch(/create function public\.analytics_stage_conversations\(/);
    expect(bodies).not.toMatch(/auth\.uid\(\)/);
    expect(bodies).not.toMatch(/security\s+definer/i);
  });

  it("anon can never execute them", () => {
    for (const fn of ["analytics_scope_uid", "analytics_overview", "analytics_stage_conversations"]) {
      expect(sql, `${fn} must revoke from public, anon`).toMatch(
        new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon;`)
      );
    }
  });
});
