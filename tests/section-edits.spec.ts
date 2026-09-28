import { describe, it, expect } from "vitest";
import {
  applyTextEdits,
  rebaseOnLive,
  sectionFingerprint,
  FULL_REWRITE_MAX_CHARS,
} from "@/lib/section-edits";
import { finalizeProposal, parseProposalInput } from "@/lib/openai-changes";

/**
 * Request Changes used to have the AI return a WHOLE revised section. Live
 * sections run to 100k characters, past what one AI reply can hold, so the
 * rewrite was cut off or silently shortened. Proposals are now targeted edits
 * applied by code, and every proposal remembers which version of the section it
 * was drafted against so a later write can never silently undo another change.
 */

const BASE = [
  "You are Max, a warm concierge for Acme Coffee.",
  "",
  "We open at 7am on weekdays and 8am on weekends.",
  "Never promise same-day delivery.",
].join("\n");

describe("applyTextEdits", () => {
  it("replaces one exact passage and leaves the rest byte for byte", () => {
    const r = applyTextEdits(BASE, {
      edits: [{ find: "We open at 7am on weekdays", replace: "We open at 6am on weekdays" }],
    });
    expect(r).toEqual({ ok: true, text: BASE.replace("7am on weekdays", "6am on weekdays") });
  });

  it("applies several edits regardless of the order they are listed in", () => {
    const r = applyTextEdits(BASE, {
      edits: [
        { find: "Never promise same-day delivery.", replace: "Same-day delivery is available downtown." },
        { find: "a warm concierge", replace: "an upbeat concierge" },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toContain("an upbeat concierge");
      expect(r.text).toContain("Same-day delivery is available downtown.");
      expect(r.text).toContain("We open at 7am on weekdays and 8am on weekends.");
    }
  });

  it("deletes a passage when replace is empty", () => {
    const r = applyTextEdits(BASE, { edits: [{ find: "\nNever promise same-day delivery.", replace: "" }] });
    expect(r.ok && r.text.includes("same-day")).toBe(false);
    expect(r.ok && r.text.endsWith("8am on weekends.")).toBe(true);
  });

  it("appends new material after a blank line", () => {
    const r = applyTextEdits(BASE, { append: "Parking is free after 5pm." });
    expect(r).toEqual({ ok: true, text: `${BASE}\n\nParking is free after 5pm.` });
  });

  it("appending to an empty section is just the new text", () => {
    expect(applyTextEdits("", { append: "Hello." })).toEqual({ ok: true, text: "Hello." });
  });

  it("tolerates whitespace the model collapsed, and edits the ORIGINAL span", () => {
    const base = "Line one.\n\nWe  open   at 7am.\nLine three.";
    const r = applyTextEdits(base, { edits: [{ find: "We open at 7am.", replace: "We open at 6am." }] });
    expect(r).toEqual({ ok: true, text: "Line one.\n\nWe open at 6am.\nLine three." });
  });

  it("tolerates curly quotes and long dashes the model straightened", () => {
    const base = "It’s simple — book a call.";
    const r = applyTextEdits(base, { edits: [{ find: "It's simple - book a call.", replace: "Book a call." }] });
    expect(r).toEqual({ ok: true, text: "Book a call." });
  });

  it("stays case sensitive, so it never edits a look-alike", () => {
    const r = applyTextEdits(BASE, { edits: [{ find: "we open at 7am", replace: "x" }] });
    expect(r.ok).toBe(false);
  });

  it("reports a passage that is not in the section", () => {
    const r = applyTextEdits(BASE, { edits: [{ find: "We close at midnight.", replace: "x" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join(" ")).toMatch(/not found/i);
  });

  it("refuses an ambiguous passage instead of guessing which copy", () => {
    const base = "Call us today.\nReally, Call us today.";
    const r = applyTextEdits(base, { edits: [{ find: "Call us today.", replace: "x" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join(" ")).toMatch(/2 times/);
  });

  it("refuses overlapping edits", () => {
    const r = applyTextEdits(BASE, {
      edits: [
        { find: "We open at 7am on weekdays", replace: "a" },
        { find: "7am on weekdays and 8am", replace: "b" },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join(" ")).toMatch(/overlap/i);
  });

  it("refuses an empty find", () => {
    const r = applyTextEdits(BASE, { edits: [{ find: "   ", replace: "x" }] });
    expect(r.ok).toBe(false);
  });

  it("allows a whole new section only when the current one is empty or short", () => {
    expect(applyTextEdits("", { replacement: "Brand new." })).toEqual({ ok: true, text: "Brand new." });
    expect(applyTextEdits(BASE, { replacement: "Shorter." })).toEqual({ ok: true, text: "Shorter." });
    const long = "x".repeat(FULL_REWRITE_MAX_CHARS + 1);
    const r = applyTextEdits(long, { replacement: "Tiny." });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join(" ")).toMatch(/too long to replace/i);
  });

  it("refuses a whole-section replacement mixed with edits", () => {
    const r = applyTextEdits(BASE, {
      replacement: "New.",
      edits: [{ find: "7am", replace: "6am" }],
    });
    expect(r.ok).toBe(false);
  });

  it("refuses a change that changes nothing", () => {
    const r = applyTextEdits(BASE, { edits: [{ find: "7am", replace: "7am" }] });
    expect(r.ok).toBe(false);
  });

  it("refuses an empty proposal", () => {
    expect(applyTextEdits(BASE, {}).ok).toBe(false);
  });
});

describe("sectionFingerprint", () => {
  it("is stable for the same text and differs for different text", () => {
    expect(sectionFingerprint(BASE)).toBe(sectionFingerprint(BASE));
    expect(sectionFingerprint(BASE)).not.toBe(sectionFingerprint(`${BASE} `));
    expect(sectionFingerprint("")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("rebaseOnLive (Apply / Publish)", () => {
  const edits = [{ find: "7am on weekdays", replace: "6am on weekdays" }];
  const drafted = applyTextEdits(BASE, { edits });
  const text = drafted.ok ? drafted.text : "";

  it("writes the drafted text when the section has not changed", () => {
    expect(rebaseOnLive(BASE, { base_hash: sectionFingerprint(BASE), edits, text })).toEqual({
      ok: true,
      text,
      rebased: false,
    });
  });

  it("re-applies the edits on top of a change made since, keeping both", () => {
    const live = BASE.replace("Never promise", "Never ever promise");
    const r = rebaseOnLive(live, { base_hash: sectionFingerprint(BASE), edits, text });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rebased).toBe(true);
      expect(r.text).toContain("Never ever promise");
      expect(r.text).toContain("6am on weekdays");
    }
  });

  it("stops when the passage it edits was changed since", () => {
    const live = BASE.replace("7am on weekdays", "9am on weekdays");
    const r = rebaseOnLive(live, { base_hash: sectionFingerprint(BASE), edits, text });
    expect(r.ok).toBe(false);
  });

  it("stops when a whole-section rewrite would overwrite a later change", () => {
    const r = rebaseOnLive(`${BASE}\nNew line.`, {
      base_hash: sectionFingerprint(BASE),
      text: "Rewritten.",
    });
    expect(r.ok).toBe(false);
  });

  it("treats a section that already has the approved text as done (a retried publish)", () => {
    // Publish writes the sections first; if a later step fails and the team clicks
    // Publish again, re-applying the edits would find nothing to replace and
    // report a false conflict. The text is already live, so it is simply done.
    expect(rebaseOnLive(text, { base_hash: sectionFingerprint(BASE), edits, text })).toEqual({
      ok: true,
      text,
      rebased: false,
    });
  });

  it("keeps working for proposals saved before fingerprints existed", () => {
    expect(rebaseOnLive("anything", { text: "Old proposal." })).toEqual({
      ok: true,
      text: "Old proposal.",
      rebased: false,
    });
  });
});

describe("parseProposalInput + finalizeProposal", () => {
  it("accepts targeted edits for a section category", () => {
    const p = parseProposalInput(
      { summary: "Earlier opening.", edits: [{ find: "7am on weekdays", replace: "6am on weekdays" }] },
      "offers"
    );
    expect(p.section).toBe("offers_section");
    expect(p.edits).toHaveLength(1);
  });

  it("drops malformed edits and rejects a proposal with nothing usable", () => {
    expect(() =>
      parseProposalInput({ summary: "x", edits: [{ find: 3 }, null, { replace: "y" }] }, "offers")
    ).toThrow();
  });

  it("still accepts a whole section (short or empty sections)", () => {
    const p = parseProposalInput({ summary: "New.", section_content: "All new." }, "personality");
    expect(p.section_content).toBe("All new.");
  });

  it("finalize computes the new text and pins the base it was drafted on", () => {
    const p = parseProposalInput(
      { summary: "Earlier.", edits: [{ find: "7am on weekdays", replace: "6am on weekdays" }] },
      "offers"
    );
    const f = finalizeProposal(p, { offers_section: BASE });
    expect(f.ok).toBe(true);
    if (f.ok) {
      expect(f.proposal.section_content).toBe(BASE.replace("7am", "6am"));
      expect(f.proposal.base_hash).toBe(sectionFingerprint(BASE));
    }
  });

  it("finalize prefers edits when the model sends both edits and a whole section", () => {
    const p = parseProposalInput(
      {
        summary: "x",
        section_content: "A careless full rewrite.",
        edits: [{ find: "7am on weekdays", replace: "6am on weekdays" }],
      },
      "offers"
    );
    const f = finalizeProposal(p, { offers_section: BASE });
    expect(f.ok && f.proposal.section_content).toBe(BASE.replace("7am", "6am"));
  });

  it("finalize reports edits that do not match the live text", () => {
    const p = parseProposalInput({ summary: "x", edits: [{ find: "Not there.", replace: "y" }] }, "offers");
    const f = finalizeProposal(p, { offers_section: BASE });
    expect(f.ok).toBe(false);
  });

  it("finalize refuses a whole rewrite of a long section", () => {
    const long = "Line.\n".repeat(FULL_REWRITE_MAX_CHARS);
    const p = parseProposalInput({ summary: "x", section_content: "Short." }, "personality");
    expect(finalizeProposal(p, { persona_section: long }).ok).toBe(false);
  });

  it("finalize handles an overall request section by section", () => {
    const p = parseProposalInput(
      {
        summary: "x",
        sections: [
          { section: "offers_section", edits: [{ find: "7am on weekdays", replace: "6am on weekdays" }] },
          { section: "persona_section", append: "Always sign off with the brand name." },
        ],
      },
      "overall"
    );
    const f = finalizeProposal(p, { offers_section: BASE, persona_section: "You are Max." });
    expect(f.ok).toBe(true);
    if (f.ok) {
      const offers = f.proposal.sections?.find((s) => s.section === "offers_section");
      const persona = f.proposal.sections?.find((s) => s.section === "persona_section");
      expect(offers?.section_content).toBe(BASE.replace("7am", "6am"));
      expect(offers?.base_hash).toBe(sectionFingerprint(BASE));
      expect(persona?.section_content).toBe("You are Max.\n\nAlways sign off with the brand name.");
    }
  });

  it("a knowledge-only proposal passes through untouched", () => {
    const p = parseProposalInput(
      { summary: "x", kb_entries: [{ title: "Hours", content: "7am" }] },
      "other"
    );
    const f = finalizeProposal(p, {});
    expect(f.ok && f.proposal.kb_entries).toHaveLength(1);
  });
});
