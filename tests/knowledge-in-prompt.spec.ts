import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { CHATBOT_TABS, knowledgeHref, knowledgeRedirectTarget } from "@/lib/chatbot-tabs";
import { IMPERSONATION_HREFS, MOBILE_TABS, WORKSPACE_NAV } from "@/lib/nav";
import { kbHealth } from "@/lib/kb-health";
import { assembledSize } from "@/lib/retrieval";
import { KB_CHAR_BUDGET, RETRIEVAL_CUTOVER } from "@/lib/kb-config";

/**
 * The Knowledge Base used to be its own sidebar page. It now lives as the last
 * section of each chatbot's Prompt tab, because knowledge belongs to one bot
 * (knowledge_base.chatbot_id) and in production every bot carries one uploaded
 * document, not a library of entries.
 */

const ROOT = path.resolve(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
/** Source without comments, so prose explaining a removed rule can't satisfy
 *  or fail an assertion about the code. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("knowledgeHref", () => {
  it("points at the Knowledge section of the bot's Prompt tab", () => {
    expect(knowledgeHref("bot-1")).toBe("/chatbots/bot-1?tab=prompt#knowledge");
  });
});

describe("knowledgeRedirectTarget (old /knowledge-base links)", () => {
  it("honours ?bot= when the account owns that bot", () => {
    expect(knowledgeRedirectTarget(["a", "b"], "b")).toBe(knowledgeHref("b"));
  });

  it("ignores a ?bot= the account does not own", () => {
    expect(knowledgeRedirectTarget(["a", "b"], "someone-else")).toBe("/chatbots");
    expect(knowledgeRedirectTarget(["a"], "someone-else")).toBe(knowledgeHref("a"));
  });

  it("goes straight to the only bot", () => {
    expect(knowledgeRedirectTarget(["a"], null)).toBe(knowledgeHref("a"));
    expect(knowledgeRedirectTarget(["a"], "")).toBe(knowledgeHref("a"));
  });

  it("sends a multi-bot account to the roster to pick one", () => {
    expect(knowledgeRedirectTarget(["a", "b", "c"], null)).toBe("/chatbots");
  });

  it("sends an account with no bot to create one", () => {
    expect(knowledgeRedirectTarget([], null)).toBe("/chatbots/new");
    expect(knowledgeRedirectTarget([], "a")).toBe("/chatbots/new");
  });
});

describe("navigation", () => {
  it("the sidebar no longer carries a Knowledge Base item", () => {
    expect(WORKSPACE_NAV.map((i) => i.href)).not.toContain("/knowledge-base");
  });

  it("the view-as allowlist no longer names the removed item", () => {
    expect(IMPERSONATION_HREFS.has("/knowledge-base")).toBe(false);
  });

  it("the mobile tab bar still picks the same four items by index", () => {
    // MOBILE_TABS indexes into WORKSPACE_NAV, so removing an item before index 4
    // would silently swap a tab. Pin the result, not the indexes.
    expect(MOBILE_TABS.map((i) => i.href)).toEqual([
      "/dashboard",
      "/conversations",
      "/follow-ups",
      "/statistics",
    ]);
  });

  it("the Prompt tab's label says it holds the knowledge too", () => {
    const prompt = CHATBOT_TABS.find((t) => t.key === "prompt");
    expect(prompt?.label).toMatch(/knowledge/i);
  });

  it("the top bar no longer lists Knowledge Base as a scoped page", () => {
    expect(read("components/dashboard/topbar.tsx")).not.toMatch(/Knowledge Base/);
  });
});

const entry = (
  over: Partial<{ title: string; content: string; indexed: boolean; needs_review: boolean }> = {}
) => ({ title: "Prices", content: "x".repeat(1_000), indexed: true, needs_review: false, ...over });

const base = { embeddingsEnabled: true, retrievalActive: false, forceRetrieval: false };

describe("kbHealth", () => {
  it("reports an empty knowledge base as mode none", () => {
    const h = kbHealth({ ...base, entries: [] });
    expect(h).toMatchObject({ entries: 0, chars: 0, approxTokens: 0, mode: "none", overBudget: false });
  });

  it("measures size exactly as the reply path does", () => {
    const entries = [entry(), entry({ title: "Refunds", content: "y".repeat(2_500) })];
    const h = kbHealth({ ...base, entries });
    expect(h.chars).toBe(assembledSize(entries));
    expect(h.approxTokens).toBe(Math.round(h.chars / 4));
    expect(h.entries).toBe(2);
  });

  it("a small, indexed knowledge base is read in full on every reply", () => {
    expect(kbHealth({ ...base, entries: [entry()] }).mode).toBe("full");
  });

  it("an unindexed entry forces full mode, even with forced retrieval", () => {
    const h = kbHealth({
      ...base,
      forceRetrieval: true,
      entries: [entry(), entry({ indexed: false })],
    });
    expect(h.mode).toBe("full");
    expect(h.unindexed).toBe(1);
    expect(h.indexed).toBe(1);
  });

  it("forced retrieval searches a fully indexed knowledge base", () => {
    expect(kbHealth({ ...base, forceRetrieval: true, entries: [entry()] }).mode).toBe("search");
  });

  it("switches to search above the cutover", () => {
    const big = entry({ content: "z".repeat(RETRIEVAL_CUTOVER + 10) });
    expect(kbHealth({ ...base, entries: [big] }).mode).toBe("search");
  });

  it("keeps the hysteresis dead band: full until active, search once active", () => {
    const mid = entry({ content: "z".repeat(KB_CHAR_BUDGET + 100) });
    expect(RETRIEVAL_CUTOVER).toBeGreaterThan(KB_CHAR_BUDGET + 200);
    expect(kbHealth({ ...base, entries: [mid] }).mode).toBe("full");
    expect(kbHealth({ ...base, retrievalActive: true, entries: [mid] }).mode).toBe("search");
  });

  it("never searches when embeddings are off", () => {
    const big = entry({ content: "z".repeat(RETRIEVAL_CUTOVER + 10) });
    expect(kbHealth({ ...base, embeddingsEnabled: false, entries: [big] }).mode).toBe("full");
  });

  it("flags full mode over the per-reply budget", () => {
    const mid = entry({ content: "z".repeat(KB_CHAR_BUDGET + 100) });
    expect(kbHealth({ ...base, entries: [mid] }).overBudget).toBe(true);
    expect(kbHealth({ ...base, entries: [entry()] }).overBudget).toBe(false);
    // Search mode never injects the whole thing, so it is never "over budget".
    expect(kbHealth({ ...base, retrievalActive: true, entries: [mid] }).overBudget).toBe(false);
  });

  it("counts entries whose extraction needs a human look", () => {
    const h = kbHealth({ ...base, entries: [entry({ needs_review: true }), entry()] });
    expect(h.needsReview).toBe(1);
  });
});

describe("the old /knowledge-base route is a redirect", () => {
  const page = code("app/(dashboard)/knowledge-base/page.tsx");

  it("redirects through knowledgeRedirectTarget", () => {
    expect(page).toMatch(/redirect\(\s*knowledgeRedirectTarget\(/);
  });

  it("scopes the bot list to the viewed account (view-as aware)", () => {
    expect(page).toMatch(/getCurrentUser\(\)/);
    expect(page).toMatch(/\.eq\("user_id",\s*user\.id\)/);
  });

  it("no longer renders the old manager", () => {
    expect(page).not.toMatch(/KnowledgeBaseManager/);
  });

  it("has no loading skeleton for a page that only redirects", () => {
    expect(existsSync(path.join(ROOT, "app/(dashboard)/knowledge-base/loading.tsx"))).toBe(false);
  });

  it("the old per-page bot selector component is gone", () => {
    expect(existsSync(path.join(ROOT, "components/dashboard/kb-manager.tsx"))).toBe(false);
  });
});

describe("the Prompt tab carries the Knowledge section", () => {
  const panel = code("components/dashboard/chatbot-tab-panel.tsx");

  it("renders KnowledgeSection on the prompt tab", () => {
    expect(panel).toMatch(/tab === "prompt"[\s\S]*<KnowledgeSection/);
  });

  it("anchors the section so old links and the jump links land on it", () => {
    expect(read("components/dashboard/knowledge-section.tsx")).toMatch(/id="knowledge"/);
  });

  it("gives the prompt tab its own skeleton", () => {
    expect(panel).toMatch(/tab === "prompt"\)\s*\{\s*return/);
  });

  it("renders the hash scroller on the prompt tab, so #knowledge links land there", () => {
    expect(panel).toMatch(/tab === "prompt"[\s\S]*<ScrollToHash \/>/);
  });

  it("never hands the list an entry's full body (only the preview)", () => {
    // The row list must drop `content` and ship `content_preview`. A property
    // named content (shorthand `content,` or `content: x`) in the object the list
    // receives would put every whole body back into the browser payload.
    const section = code("components/dashboard/knowledge-section.tsx");
    const start = section.indexOf("const entries = raw.map(");
    expect(start).toBeGreaterThan(-1);
    const block = section.slice(start, section.indexOf("}));", start) + 4);
    expect(block).toMatch(/raw\.map\(\(\{\s*content,/);
    const body = block.slice(block.indexOf("=> ({"));
    expect(body).not.toMatch(/(^|[\s{,])content\s*[,:}]/m);
    expect(body).toMatch(/content_preview:/);
  });
});

describe("no more 'six entries' rule", () => {
  // Every production bot holds ONE uploaded document, so an entry-count rule
  // told every client their knowledge was thin. The statistic behind it was
  // never measured.
  it("the Overview only warns about an EMPTY knowledge base", () => {
    const panel = code("components/dashboard/chatbot-tab-panel.tsx");
    expect(panel).not.toMatch(/kbCount\s*<\s*6/);
    expect(panel).not.toMatch(/"\/knowledge-base"/);
    expect(panel).toMatch(/kbCount === 0/);
  });

  it("the Learn lesson drops the thin signal and the unmeasured statistic", () => {
    const learn = read("lib/learn.ts");
    expect(learn).not.toMatch(/kbEntries\s*<\s*6/);
    expect(learn).not.toMatch(/a third as often/);
  });

  it("no UI copy repeats the unmeasured statistic", () => {
    for (const rel of [
      "components/dashboard/chatbot-tab-panel.tsx",
      "components/dashboard/knowledge-section.tsx",
    ]) {
      expect(read(rel), rel).not.toMatch(/third as often/);
    }
  });
});
