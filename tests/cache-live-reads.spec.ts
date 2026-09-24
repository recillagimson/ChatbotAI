import { describe, it, expect } from "vitest";
import { code, read, sourceFiles } from "./helpers/source";

/**
 * Phase 3 criterion 6, plus the rule that keeps the app cache-free until a
 * cache is deliberately reviewed.
 *
 * Phase 3 set out to add three Redis caches and, after measuring, shipped
 * none. The knowledge-base read takes 0.15 ms and runs after the webhook has
 * already acked; the analytics report takes ~11 ms at 7 days; and every cache
 * would have added a new way to serve one tenant's data to another. So these
 * tests make a cache something you must do on purpose: adding one fails here,
 * and the fix is to update this file with a reason and a tenant-safe key.
 *
 * STATIC assertions, like dashboard-row-bounds.spec.ts: they prove what the
 * source says, not what a running route does. Comments are stripped by
 * TypeScript's parser first, so the prose explaining each rule cannot satisfy
 * or break it (the webhook's own DO NOT CACHE comments name unstable_cache).
 *
 * Line endings: the Windows working tree may be CRLF and CI is LF, so every
 * assertion holds on both (\s matches \r; lines are trimmed before comparing).
 */

const WEBHOOK = "app/api/webhooks/manychat/route.ts";

describe("webhook: the chatbots row and the subscription are read live", () => {
  const src = read(WEBHOOK);
  const live = code(WEBHOOK);
  const HINT =
    " If you changed this read on purpose, keep it a direct PostgREST read and update this regex.";

  it("the chatbots row is a direct PostgREST read", () => {
    expect(live, "chatbots read changed." + HINT).toMatch(
      /const \{ data: chatbot \} = await supabase\s*\.from\("chatbots"\)\s*\.select\("\*"\)\s*\.eq\("id", body\.chatbot_id\)\s*\.eq\("is_active", true\)\s*\.maybeSingle<Chatbot>\(\);/
    );
  });

  it("the subscription is a direct PostgREST read", () => {
    expect(live, "subscriptions read changed." + HINT).toMatch(
      /const \{ data: subscription \} = await supabase\s*\.from\("subscriptions"\)\s*\.select\("status, comp_expires_at"\)\s*\.eq\("user_id", chatbot\.user_id\)\s*\.maybeSingle\(\);/
    );
  });

  it("each table is selected exactly once, so no copy is read from anywhere else", () => {
    expect(live.match(/\.from\("chatbots"\)\s*\.select\(/g) ?? []).toHaveLength(1);
    expect(live.match(/\.from\("subscriptions"\)\s*\.select\(/g) ?? []).toHaveLength(1);
  });

  it("buildKbBlock never selects the chatbots row; it uses the live one the caller passes", () => {
    expect(code("lib/retrieval.ts")).not.toMatch(/\.from\("chatbots"\)\s*\.select\(/);
  });

  it("a DO NOT CACHE comment sits directly above each read", () => {
    for (const [marker, anchor] of [
      ["DO NOT CACHE (chatbots row)", "const { data: chatbot } = await supabase"],
      ["DO NOT CACHE (subscriptions)", "const { data: subscription } = await supabase"],
    ] as const) {
      const at = src.indexOf(anchor);
      expect(at, `${anchor} not found`).toBeGreaterThan(-1);
      const before = src.slice(0, at);
      const markerAt = before.lastIndexOf(marker);
      expect(markerAt, `"${marker}" comment missing above ${anchor}`).toBeGreaterThan(-1);
      // Directly above: nothing but comment lines between the marker and the read.
      const between = before
        .slice(markerAt)
        .split("\n")
        .slice(1)
        .map((l) => l.trim())
        .filter(Boolean);
      expect(
        between.every((l) => l.startsWith("//")),
        `code between "${marker}" and the read`
      ).toBe(true);
    }
  });
});

describe("the app has no cross-request cache until one is reviewed", () => {
  const files = sourceFiles();

  it("there is exactly one Redis client, the one in lib/limits.ts", () => {
    const constructors = files.filter((f) => /\bnew\s+Redis\s*\(/.test(code(f)));
    expect(constructors).toEqual(["lib/limits.ts"]);
  });

  it("only lib/limits.ts talks to Upstash", () => {
    // Its Redis use today is rate limits, dedup and reply counters: short-lived
    // per-subscriber or per-bot gates, not cached copies of tenant data.
    // Any mention of the package in code counts: a static import, a dynamic
    // import("@upstash/...") or a require all name it.
    const importers = files.filter((f) => /["']@upstash\//.test(code(f)));
    expect(importers).toEqual(["lib/limits.ts"]);
  });

  it("no file uses a cross-request cache primitive", () => {
    // A cache added here must key on the EFFECTIVE tenant and never be filled
    // under "View as client" by a request whose JWT is someone else's. If you
    // are adding one on purpose, allowlist the file with that argument written
    // down, and add a test that two tenants cannot share a key.
    // Any mention, not just a call: `import { unstable_cache as c }` then c(...)
    // would slip past a call-only pattern. Comments are already stripped, so
    // the prose explaining this rule cannot trip it.
    const offenders = files.filter((f) =>
      /\bunstable_cache\b|\brevalidateTag\b|["']use cache["']/.test(code(f))
    );
    expect(offenders).toEqual([]);
  });

  it("a tenant's ManyChat flow list is marked uncacheable by any HTTP cache", () => {
    const route = code("app/api/chatbots/[id]/manychat-flows/route.ts");
    expect(route).toMatch(/NextResponse\.json\(\s*\{\s*flows\s*\}\s*,\s*\{\s*headers:\s*\{\s*"Cache-Control":\s*"private, no-store"/);
  });
});
