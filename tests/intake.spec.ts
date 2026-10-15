import { describe, it, expect } from "vitest";
import {
  INTAKE_QUESTIONS,
  MAX_TEXTAREA_CHARS,
  intakeDefaults,
  intakeToPlainText,
  parseIntakeSubmission,
} from "@/lib/intake";

const minimal = { name: "Keem", instagram: "@privatelife_", email: "Keem@Example.com" };

describe("parseIntakeSubmission", () => {
  it("accepts the three required fields and lowercases the email", () => {
    const r = parseIntakeSubmission({ answers: minimal });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.email).toBe("keem@example.com");
      expect(r.value.name).toBe("Keem");
      expect(r.value.business).toBeNull();
    }
  });

  it("reports each missing required field", () => {
    const r = parseIntakeSubmission({ answers: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["email", "instagram", "name"]);
  });

  it("rejects a malformed email", () => {
    const r = parseIntakeSubmission({ answers: { ...minimal, email: "not-an-email" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.email).toBeTruthy();
  });

  it("drops a submission with the honeypot filled, as spam", () => {
    const r = parseIntakeSubmission({ answers: minimal, website: "http://spam.example" });
    expect(r).toEqual({ ok: false, spam: true, errors: {} });
  });

  it("keeps only real options for choice questions", () => {
    const r = parseIntakeSubmission({
      answers: {
        ...minimal,
        vibe: ["Calm and patient", "Not a real option", "Calm and patient"],
        emojis: "Made up",
        casing: "all lowercase",
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.answers.vibe).toEqual(["Calm and patient"]);
      expect(r.value.answers.emojis).toBeUndefined();
      expect(r.value.answers.casing).toBe("all lowercase");
    }
  });

  it("ignores unknown keys and caps long answers", () => {
    const r = parseIntakeSubmission({
      answers: { ...minimal, evil: "x", real_dms: "a".repeat(MAX_TEXTAREA_CHARS + 500) },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.answers.evil).toBeUndefined();
      expect((r.value.answers.real_dms as string).length).toBe(MAX_TEXTAREA_CHARS);
    }
  });

  it("never throws on junk input", () => {
    for (const junk of [null, undefined, 42, "x", [], { answers: "nope" }]) {
      expect(() => parseIntakeSubmission(junk)).not.toThrow();
    }
  });

  it("has unique question ids", () => {
    const ids = INTAKE_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("intakeToPlainText", () => {
  it("prints answered questions under their section, skipping empty ones", () => {
    const text = intakeToPlainText({
      name: "Keem",
      vibe: ["Casual, like texting a friend", "Straight to the point"],
      emojis: "A few",
    });
    expect(text).toContain("## YOUR BUSINESS");
    expect(text).toContain("Keem");
    expect(text).toContain("Casual, like texting a friend, Straight to the point");
    expect(text).toContain("A few");
    expect(text).not.toContain("## HOW YOU'D REPLY");
  });
});

describe("intakeDefaults", () => {
  it("pre-fills every reply question except the optional real DM paste", () => {
    const d = intakeDefaults();
    for (const id of ["greeting", "r_price", "r_legit", "r_scammed", "r_think", "r_bot", "hype"]) {
      expect(typeof d[id]).toBe("string");
      expect((d[id] as string).length).toBeGreaterThan(10);
    }
    expect(d.real_dms).toBeUndefined();
    expect(d.name).toBeUndefined();
  });

  it("defaults pass validation unchanged", () => {
    const r = parseIntakeSubmission({ answers: { ...intakeDefaults(), name: "A", instagram: "@a", email: "a@b.co" } });
    expect(r.ok).toBe(true);
  });
});
