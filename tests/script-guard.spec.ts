import { describe, it, expect } from "vitest";
import { foreignScriptLeak } from "@/lib/script-guard";

/**
 * A live AI follow-up ended "i can resend the link هنا" in an all-English thread: one
 * Arabic word leaked into an English message. The guard rejects a generated message that
 * uses a writing system the conversation never used, so the caller can skip it.
 */
describe("foreignScriptLeak", () => {
  const english = ["Credit", "I have collections and late payments", "I want to get started"];

  it("flags an Arabic word in an English thread (the live incident)", () => {
    expect(
      foreignScriptLeak("still good on getting started? if you want, i can resend the link هنا", english)
    ).toBe(true);
  });

  it("flags Cyrillic, CJK, Hangul, Hebrew and Devanagari leaks", () => {
    for (const word of ["здесь", "这里", "ここ", "여기", "כאן", "यहाँ"]) {
      expect(foreignScriptLeak(`send it ${word}`, english)).toBe(true);
    }
  });

  it("passes plain English", () => {
    expect(foreignScriptLeak("still good on getting started? I can send you the link", english)).toBe(false);
  });

  it("passes Spanish and accented Latin text (same script)", () => {
    expect(foreignScriptLeak("¿todavía quieres arrancar? te mando el link", english)).toBe(false);
  });

  it("passes emoji, punctuation and the $ sign", () => {
    expect(foreignScriptLeak("bet 🔥 it's $79/mo — lmk 👌🏽", english)).toBe(false);
  });

  it("allows a script the lead used themselves", () => {
    expect(foreignScriptLeak("تمام، هنا الرابط", ["مرحبا", "كم السعر؟"])).toBe(false);
  });

  it("fails open on empty or missing input", () => {
    expect(foreignScriptLeak("", english)).toBe(false);
    expect(foreignScriptLeak("hello", [])).toBe(false);
    expect(foreignScriptLeak(undefined as unknown as string, english)).toBe(false);
    expect(foreignScriptLeak("hola", [null as unknown as string])).toBe(false);
  });
});
