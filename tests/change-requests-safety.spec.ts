import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildChangeFinal, planPublish } from "@/lib/change-final";
import { applyTextEdits, sectionFingerprint, MAX_SECTION_CHARS } from "@/lib/section-edits";
import { pickSectionOverrides } from "@/lib/change-categories";
import type { ChangeProposal } from "@/lib/types";

/**
 * Approve -> Publish safety for Request Changes.
 *  - The team's Approve keeps the proposal's edits and base fingerprint, so
 *    Publish can re-check against the live text; a hand-edited text keeps only
 *    the fingerprint (it can be checked, not re-applied).
 *  - Publish re-applies edits on top of newer live text, or refuses: it never
 *    silently overwrites a change made after the proposal was drafted.
 */

const ROOT = path.resolve(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const OFFERS = "Coaching is $97 a month.\nThe course is $7.";
const edits = [{ find: "$97 a month", replace: "$99 a month" }];
const drafted = applyTextEdits(OFFERS, { edits });
const draftedText = drafted.ok ? drafted.text : "";

const proposal: ChangeProposal = {
  summary: "Price bump.",
  section: "offers_section",
  section_content: draftedText,
  edits,
  base_hash: sectionFingerprint(OFFERS),
};

describe("buildChangeFinal (Approve)", () => {
  it("keeps the edits and fingerprint when the team approves the text as proposed", () => {
    const f = buildChangeFinal({ category: "offers", proposed: proposal, section_content: draftedText });
    expect(f).toMatchObject({
      section: "offers_section",
      section_content: draftedText,
      edits,
      base_hash: proposal.base_hash,
    });
  });

  it("drops the edits but keeps the fingerprint when the team rewrote the text", () => {
    const f = buildChangeFinal({
      category: "offers",
      proposed: proposal,
      section_content: `${draftedText}\nHand-added line.`,
    });
    expect(f.edits).toBeUndefined();
    expect(f.base_hash).toBe(proposal.base_hash);
  });

  it("carries per-section edits for an overall request", () => {
    const overall: ChangeProposal = {
      summary: "x",
      sections: [
        { section: "offers_section", section_content: draftedText, edits, base_hash: proposal.base_hash },
      ],
    };
    const f = buildChangeFinal({
      category: "overall",
      proposed: overall,
      sections: [{ section: "offers_section", section_content: draftedText }],
    });
    expect(f.sections?.[0]).toMatchObject({ edits, base_hash: proposal.base_hash });
  });

  it("keeps knowledge entries trimmed and the legacy system prompt path", () => {
    const f = buildChangeFinal({
      category: "other",
      proposed: { summary: "x" },
      kb_entries: [{ title: " Hours ", content: " 7am " }],
      system_prompt: " legacy ",
    });
    expect(f.kb_entries).toEqual([{ title: "Hours", content: "7am" }]);
    expect(f.system_prompt).toBe("legacy");
  });
});

describe("planPublish (Publish)", () => {
  const live = (offers: string) => ({
    persona_section: "P",
    offers_section: offers,
    rebuttals_section: "R",
    system_prompt: null,
  });
  const final = buildChangeFinal({ category: "offers", proposed: proposal, section_content: draftedText });

  it("publishes the approved text when nothing changed since drafting", () => {
    expect(planPublish("offers", final, live(OFFERS))).toEqual({
      ok: true,
      patch: { offers_section: draftedText },
      rebased: [],
    });
  });

  it("re-applies the edits on top of a newer change instead of undoing it", () => {
    const newer = `${OFFERS}\nFree shipping this week.`;
    const r = planPublish("offers", final, live(newer));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.patch.offers_section).toContain("$99 a month");
      expect(r.patch.offers_section).toContain("Free shipping this week.");
      expect(r.rebased).toEqual(["offers_section"]);
    }
  });

  it("refuses when the edited passage itself changed since drafting", () => {
    const r = planPublish("offers", final, live(OFFERS.replace("$97", "$95")));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.conflicts.join(" ")).toMatch(/Offers/);
  });

  it("refuses a hand-edited text when the live section changed since drafting", () => {
    const edited = buildChangeFinal({
      category: "offers",
      proposed: proposal,
      section_content: "Totally rewritten by the team.",
    });
    expect(planPublish("offers", edited, live(`${OFFERS}\nNew line.`)).ok).toBe(false);
    expect(planPublish("offers", edited, live(OFFERS))).toMatchObject({
      ok: true,
      patch: { offers_section: "Totally rewritten by the team." },
    });
  });

  it("publishes every section of an overall request together, or none", () => {
    const overall = buildChangeFinal({
      category: "overall",
      proposed: {
        summary: "x",
        sections: [
          { section: "offers_section", section_content: draftedText, edits, base_hash: proposal.base_hash },
          { section: "persona_section", section_content: "P2", base_hash: sectionFingerprint("P") },
        ],
      },
      sections: [
        { section: "offers_section", section_content: draftedText },
        { section: "persona_section", section_content: "P2" },
      ],
    });
    expect(planPublish("overall", overall, live(OFFERS))).toEqual({
      ok: true,
      patch: { offers_section: draftedText, persona_section: "P2" },
      rebased: [],
    });
    // Persona changed since drafting and it was a whole-text change: nothing publishes.
    const r = planPublish("overall", overall, { ...live(OFFERS), persona_section: "P changed" });
    expect(r.ok).toBe(false);
  });

  it("still publishes a legacy proposal saved before fingerprints existed", () => {
    const legacy = buildChangeFinal({
      category: "offers",
      proposed: { summary: "x", section: "offers_section", section_content: "Old style." },
      section_content: "Old style.",
    });
    expect(planPublish("offers", legacy, live("anything"))).toMatchObject({
      ok: true,
      patch: { offers_section: "Old style." },
    });
  });

  it("writes a legacy system prompt as before", () => {
    const f = buildChangeFinal({ category: "other", proposed: { summary: "x" }, system_prompt: "SP" });
    expect(planPublish("other", f, live(OFFERS))).toMatchObject({
      ok: true,
      patch: { system_prompt: "SP" },
    });
  });
});

describe("pickSectionOverrides (try a change before it goes live)", () => {
  it("keeps only the three prompt sections, as strings", () => {
    expect(
      pickSectionOverrides({
        persona_section: "P",
        offers_section: "O",
        rebuttals_section: 7,
        manychat_api_key_enc: "stolen",
        is_active: false,
      })
    ).toEqual({ persona_section: "P", offers_section: "O" });
  });

  it("returns null for nothing usable", () => {
    expect(pickSectionOverrides(undefined)).toBeNull();
    expect(pickSectionOverrides("text")).toBeNull();
    expect(pickSectionOverrides({ is_active: false })).toBeNull();
  });

  it("refuses an oversized section", () => {
    expect(pickSectionOverrides({ persona_section: "x".repeat(MAX_SECTION_CHARS + 1) })).toBeNull();
  });
});

describe("routes use the safety checks", () => {
  it("the sandbox reply accepts proposed sections only through pickSectionOverrides", () => {
    const src = code("app/api/chatbots/[id]/preview/route.ts");
    expect(src).toMatch(/pickSectionOverrides\(body\?\.sectionsOverride\)/);
    expect(src).toMatch(/export const maxDuration = 60/);
  });

  it("Apply (personality) re-checks the live text and compare-and-sets on updated_at", () => {
    const src = code("app/api/change-requests/[id]/apply/route.ts");
    expect(src).toMatch(/rebaseOnLive\(/);
    expect(src).toMatch(/status:\s*409/);
    expect(src).toMatch(/\.eq\("updated_at",/);
  });

  it("the admin route no longer caps a section at 20,000 characters", () => {
    const src = code("app/api/admin/change-requests/[id]/route.ts");
    expect(src).not.toMatch(/section_content:\s*z\.string\(\)\.max\(20_000\)/);
    expect(src).toMatch(/MAX_SECTION_CHARS/);
  });

  it("the admin route publishes through planPublish, compare-and-set, with a one-step option", () => {
    const src = code("app/api/admin/change-requests/[id]/route.ts");
    expect(src).toMatch(/planPublish\(/);
    expect(src).toMatch(/\.eq\("updated_at",/);
    expect(src).toMatch(/"approve_publish"/);
    expect(src).toMatch(/buildChangeFinal\(/);
  });

  it("the admin rail counts approved-but-unpublished requests too", () => {
    expect(code("app/(admin)/layout.tsx")).toMatch(/\.in\("status",\s*\["pending",\s*"approved"\]\)/);
  });

  it("the review screen offers Approve & publish and no stale model name", () => {
    const src = read("components/admin/change-request-review.tsx");
    expect(src).toMatch(/Approve &amp; publish|Approve & publish/);
    expect(src).not.toMatch(/Sonnet/);
  });

  it("the chat reads each attached document once and keeps its text", () => {
    const src = code("app/api/change-requests/chat/route.ts");
    expect(src).toMatch(/typeof f\.text === "string"/);
    expect(src).toMatch(/f\.text = /);
  });

  it("the chat response does not echo stored document text back to the browser", () => {
    expect(code("app/api/change-requests/chat/route.ts")).toMatch(/withoutFileText\(/);
  });
});
