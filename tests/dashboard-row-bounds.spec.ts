import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Phase 2 guard: dashboard pages must not fetch rows they never render.
 *
 * These are STATIC source assertions, and that limitation is the point to
 * understand before trusting them. They prove the source does not contain an
 * unbounded read; they cannot prove what the running route issues. Where a
 * criterion needs the running route (e.g. "zero count:exact on tab switch"),
 * that is called out in the test rather than faked with a green tick.
 *
 * Each bound below is here because it was measured against production, not
 * because it looked untidy:
 *  - /follow-ups paged 16,608 rows over 17 round trips to bucket 57 and render
 *    at most 25 cards, and sat at 83% of fetchAllRows' 20,000-row ceiling. Past
 *    that ceiling the ASCENDING order means it would have silently kept the
 *    OLDEST rows and rendered an empty queue.
 *  - /knowledge-base shipped every entry's full body to the browser twice per
 *    load (SSR HTML + RSC flight payload), bounded by nothing but
 *    MAX_KB_CHARS_PER_CHATBOT (2,000,000 chars).
 *  - chatbots/[id] aggregated every conversation a bot owns, twice, to answer a
 *    yes/no question, on a force-dynamic route where every tab click re-renders.
 */

const ROOT = path.resolve(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

/** Source with comments stripped. Needed because these files explain their own
 *  query choices in prose, so a bare regex for `count: "exact"` matches the
 *  comment saying why it is NOT used and fails a correct file. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("/follow-ups fetches only the reach window", () => {
  const src = read("app/(dashboard)/follow-ups/page.tsx");

  it("bounds the conversations fetch by last_message_at", () => {
    expect(src).toMatch(/\.gte\(\s*"last_message_at"\s*,\s*lookbackIso\s*\)/);
  });

  it("computes the clock BEFORE the fetch, so both edges agree", () => {
    const now = src.indexOf("const now = Date.now()");
    const lookback = src.indexOf("const lookbackIso");
    // `await fetchAllRows`, not `fetchAllRows` - the bare name also matches the
    // import at the top of the file, which is always index ~0.
    const fetchCall = src.indexOf("await fetchAllRows");
    expect(now).toBeGreaterThan(-1);
    expect(lookback).toBeGreaterThan(now);
    expect(fetchCall).toBeGreaterThan(lookback);
  });

  it("still reports the dormant expired count, via a head query", () => {
    // Without this the panel reads "Nothing has passed 7 days yet" on an account
    // with ~16,170 expired threads - the bound removed the rows it counted.
    expect(src).toMatch(/count:\s*"exact",\s*head:\s*true/);
    expect(src).toMatch(/\.lt\(\s*"last_message_at"\s*,\s*lookbackIso\s*\)/);
  });

  it("logs rather than silently reporting zero when that count fails", () => {
    expect(src).toMatch(/expiredError/);
  });
});

describe("/knowledge-base ships previews, not bodies", () => {
  const page = read("app/(dashboard)/knowledge-base/page.tsx");
  const list = read("components/dashboard/kb-list.tsx");
  const manager = read("components/dashboard/kb-manager.tsx");

  it("no longer selects * from knowledge_base", () => {
    expect(page).not.toMatch(/\.select\(\s*"\*,\s*chatbots\(name\)"\s*\)/);
  });

  it("bounds the page size", () => {
    expect(page).toMatch(/\.limit\(KB_LIST_MAX_ENTRIES\)/);
  });

  it("truncates the body before it reaches the client component", () => {
    expect(page).toMatch(
      /content_preview:\s*\(content\s*\?\?\s*""\)\.slice\(0,\s*KB_PREVIEW_CHARS\)/
    );
  });

  it("all three copies of the Entry shape carry content_preview, not content", () => {
    // Three, not two: the dashboard page renders KnowledgeBaseManager, which
    // holds its own copy, and only IT renders KnowledgeBaseList. Missing that
    // file is why an earlier pass would have typechecked locally and still
    // failed the Vercel build.
    for (const [name, src] of [
      ["kb-list", list],
      ["kb-manager", manager],
      ["admin client detail", read("app/(admin)/admin/clients/[id]/page.tsx")],
    ] as const) {
      expect(src, `${name} still declares content: string`).not.toMatch(
        /^\s{2}content:\s*string;/m
      );
      expect(src, `${name} is missing content_preview`).toMatch(/content_preview/);
    }
  });

  it("the editor fetches the real body instead of seeding from the preview", () => {
    // Seeding the textarea from the preview would TRUNCATE the entry on save,
    // because the save sends whatever is in the box.
    expect(list).toMatch(/fetch\(`\/api\/knowledge-base\/\$\{e\.id\}`\)/);
    expect(list).not.toMatch(/setDraftContent\(e\.content\)/);
  });
});

describe("chatbots/[id] header probes existence, not counts", () => {
  const src = code("app/(dashboard)/chatbots/[id]/page.tsx");

  it("uses limit(1) probes rather than count aggregates", () => {
    expect(src).not.toMatch(/count:\s*"exact"/);
    expect(src).toMatch(/\.limit\(1\)/);
  });

  it("KNOWN LIMIT: cannot prove the rendered route issues no count:exact", () => {
    // components/dashboard/chatbot-tab-panel.tsx legitimately issues four
    // count:exact queries on the Overview tab, because it RENDERS the numbers
    // ("1,204 threads", the KB entry count). Converting those to probes would
    // replace real figures with 0/1. So Phase 2's success criterion as originally
    // worded - "zero count:exact on tab switch" - is not achievable and is not
    // asserted here. Proving the header's own probes changed is what this file
    // can honestly do; the rest needs Supabase query logs or a Playwright spec.
    const panel = read("components/dashboard/chatbot-tab-panel.tsx");
    expect(panel).toMatch(/count:\s*"exact"/);
  });
});

describe("no dashboard page pages an unbounded table", () => {
  /**
   * Allowlist, with the reason each entry is exempt. Both exemptions are
   * deliberately unbounded FOR CORRECTNESS - bounding them would reintroduce a
   * documented bug - so this list is not a backlog.
   */
  const ALLOWED = new Map<string, string>([
    [
      "app/(dashboard)/chatbots/page.tsx",
      "Counts knowledge entries per bot by paging one small column. Bounding it " +
        "would silently truncate the count and show a false 'thin knowledge' " +
        "warning - the exact bug its own comment says the paging exists to avoid. " +
        "A grouped count in SQL is the real fix, and is not Phase 2's scope.",
    ],
    [
      "lib/workspace.ts",
      "Fallback path only, taken when workspace_conversation_rollup errors. Not " +
        "dead code: it is the runtime degradation path, so deleting it would turn " +
        "a transient RPC failure into broken sidebar badges.",
    ],
  ]);

  const walk = (dir: string): string[] =>
    readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((d) =>
      d.isDirectory()
        ? walk(path.posix.join(dir, d.name))
        : d.name.endsWith(".tsx") || d.name.endsWith(".ts")
          ? [path.posix.join(dir, d.name)]
          : []
    );

  it("every fetchAllRows call is bounded, or allowlisted with a reason", () => {
    const offenders: string[] = [];
    const files = [...walk("app/(dashboard)"), "lib/workspace.ts"];

    for (const rel of files) {
      const src = read(rel);
      if (!src.includes("fetchAllRows")) continue;
      if (ALLOWED.has(rel)) {
        expect(ALLOWED.get(rel), `${rel} allowlisted without a reason`).toBeTruthy();
        continue;
      }
      // Bounded means the call narrows by a date or an id, not just user_id -
      // every query here is already tenant-scoped, so user_id proves nothing
      // about how many rows come back.
      const bounded = /\.gte\(|\.lte\(|\.lt\(|\.gt\(|\.eq\("chatbot_id"|\.in\(/.test(src);
      if (!bounded) offenders.push(rel);
    }

    expect(offenders, `unbounded fetchAllRows in: ${offenders.join(", ")}`).toEqual([]);
  });
});
