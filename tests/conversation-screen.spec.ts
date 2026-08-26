import { describe, it, expect } from "vitest";
import {
  normalizeShortReply,
  isBenignShortReply,
  parseScreen,
  decideDisqualify,
} from "@/lib/conversation-screen";

/**
 * The pre-reply disqualify screen. A false `disqualified` is TERMINAL (silences the
 * bot forever), so every safeguard here biases toward NOT disqualifying:
 *  - normalizeShortReply folds diacritics so the Spanish benign floor actually matches
 *  - BENIGN_SHORT_REPLIES short-circuits engaged/neutral one-liners (EN + ES) to none
 *  - decideDisqualify's two-strike backstop keeps one model misfire from silencing an
 *    already-engaged lead
 * The regression that motivated this: an engaged lead answering "have you tried before?"
 * with "ive tried fixing it before. no success" was read as not_interested → terminal.
 */

describe("normalizeShortReply — diacritic folding (bilingual)", () => {
  it("folds accents to base letters instead of splitting the word", () => {
    expect(normalizeShortReply("Está bien")).toBe("esta bien");
    expect(normalizeShortReply("Nada más!")).toBe("nada mas");
    expect(normalizeShortReply("Sí")).toBe("si");
    expect(normalizeShortReply("Niño")).toBe("nino");
  });

  it("still strips apostrophes, emoji, punctuation and collapses space", () => {
    expect(normalizeShortReply("i'm good 👍")).toBe("im good");
    expect(normalizeShortReply("  None!  ")).toBe("none");
  });
});

describe("isBenignShortReply — floor never disqualifies engaged one-liners", () => {
  it("passes English benigns (incl. safe near-misses)", () => {
    for (const s of ["none", "no", "im good", "all set", "thanks", "not right now", "maybe later", "nothing for now"]) {
      expect(isBenignShortReply(s)).toBe(true);
    }
  });

  it("passes Spanish benigns after diacritic folding", () => {
    for (const s of ["está bien", "nada más", "ninguna", "no tengo preguntas", "listo", "dale", "de acuerdo", "gracias", "sí", "perfecto"]) {
      expect(isBenignShortReply(s)).toBe(true);
    }
  });

  it("does NOT auto-pass rejections/abuse — those still reach the model", () => {
    // Deliberately excluded (parity EN/ES) so a real "stop"/"not interested" is judged.
    for (const s of ["no thanks", "no gracias", "not interested", "no me interesa", "stop messaging me", "leave me alone", "youre a dumb bot"]) {
      expect(isBenignShortReply(s)).toBe(false);
    }
  });

  it("the motivating regression is NOT floored (the prompt carve-out handles it, not the floor)", () => {
    // A full sentence, so it correctly still reaches the model — the fix for this case is
    // the prompt carve-out + the two-strike backstop, verified below.
    expect(isBenignShortReply("ive tried fixing it before. no success")).toBe(false);
  });

  it("a 'not interested in [outcome], want a different service' line is NOT floored (model + prompt carve-out handle it)", () => {
    // Tony Groves: answering "get funded or clean the file first?" by CHOOSING cleanup over
    // credit-building - not a rejection. Reaches the model, where the not_interested carve-out
    // applies; the two-strike backstop (below) is the deterministic net.
    expect(isBenignShortReply("File clean. Not interested in getting credit. Just clean up")).toBe(false);
  });

  it("an impatient 'no I don't have time, just tell me how long' line is NOT floored (model + carve-out handle it)", () => {
    // Ferrari lead: "No I don't have time" = urgency/high intent, not rejection. Reaches the
    // model (impatience carve-out); the two-strike backstop keeps an engaged lead alive.
    expect(isBenignShortReply("No I don't have time I just need to know how long it's going to take")).toBe(false);
  });

  it("a hostile emoji on a benign word forces the model (not floored)", () => {
    expect(isBenignShortReply("ok 🤡")).toBe(false);
    expect(isBenignShortReply("no 🖕")).toBe(false);
  });

  it("a burst is benign only when EVERY line is benign", () => {
    expect(isBenignShortReply("none\nall good")).toBe(true);
    expect(isBenignShortReply("none\nyoure useless")).toBe(false);
  });
});

describe("parseScreen — one-word verdict mapping (unchanged)", () => {
  it("maps not_interested / abusive → disqualified, bot → bot, spam → spam, else none", () => {
    expect(parseScreen("not_interested")).toEqual({ outcome: "disqualified" });
    expect(parseScreen("abusive")).toEqual({ outcome: "disqualified" });
    expect(parseScreen("bot")).toEqual({ outcome: "bot" });
    expect(parseScreen("spam")).toEqual({ outcome: "spam" });
    expect(parseScreen("none")).toEqual({ outcome: "none" });
  });

  it("never inverts a negated 'not abusive'", () => {
    expect(parseScreen("not abusive")).toEqual({ outcome: "none" });
    expect(parseScreen("non-abusive")).toEqual({ outcome: "none" });
  });
});

describe("decideDisqualify — two-strike backstop", () => {
  it("engaged lead's FIRST disqualify is a soft strike (no tag, keep replying)", () => {
    // This is exactly the motivating regression: an engaged lead, first disqualify signal.
    expect(decideDisqualify({ outcome: "disqualified", engaged: true, strikes: 0 })).toEqual({
      kind: "soft",
      strikes: 1,
    });
  });

  it("Tony Groves regression: an engaged lead reading as not_interested is a soft strike, not a silence", () => {
    // Even if the model still fires not_interested on "...Not interested in getting credit...",
    // the backstop keeps this engaged, qualified lead replying (no tag, no silence).
    expect(decideDisqualify({ outcome: "disqualified", engaged: true, strikes: 0 })).toEqual({
      kind: "soft",
      strikes: 1,
    });
  });

  it("engaged lead's SECOND consecutive disqualify silences", () => {
    expect(decideDisqualify({ outcome: "disqualified", engaged: true, strikes: 1 })).toEqual({
      kind: "silence",
      tag: "disqualified",
    });
  });

  it("first-contact (not engaged) disqualify silences immediately", () => {
    expect(decideDisqualify({ outcome: "disqualified", engaged: false, strikes: 0 })).toEqual({
      kind: "silence",
      tag: "disqualified",
    });
  });

  it("a non-disqualify turn clears an accumulated strike (consecutive-only)", () => {
    expect(decideDisqualify({ outcome: "none", engaged: true, strikes: 1 })).toEqual({ kind: "clear" });
    expect(decideDisqualify({ outcome: "none", engaged: true, strikes: 0 })).toEqual({ kind: "none" });
  });

  it("`bot` verdict always silences immediately (not subject to strikes)", () => {
    expect(decideDisqualify({ outcome: "bot", engaged: true, strikes: 0 })).toEqual({
      kind: "silence",
      tag: "bot",
    });
  });

  it("`spam` (promo/scam blast) silences immediately as `bot` — even engaged, no soft strike", () => {
    // The crypto-casino screenshot case: promotional spam must stop instantly and is NOT
    // given the engaged-lead grace that `disqualified` gets.
    expect(decideDisqualify({ outcome: "spam", engaged: true, strikes: 0 })).toEqual({
      kind: "silence",
      tag: "bot",
    });
    expect(decideDisqualify({ outcome: "spam", engaged: false, strikes: 0 })).toEqual({
      kind: "silence",
      tag: "bot",
    });
    // pre-migration (no strike column) is irrelevant to spam - still an immediate silence.
    expect(decideDisqualify({ outcome: "spam", engaged: true, strikes: undefined })).toEqual({
      kind: "silence",
      tag: "bot",
    });
  });

  it("pre-migration (no strike column) has NO soft path — identical to before", () => {
    // strikes null/undefined => the counter is unavailable => immediate silence.
    expect(decideDisqualify({ outcome: "disqualified", engaged: true, strikes: null })).toEqual({
      kind: "silence",
      tag: "disqualified",
    });
    expect(decideDisqualify({ outcome: "disqualified", engaged: true, strikes: undefined })).toEqual({
      kind: "silence",
      tag: "disqualified",
    });
    // and a benign turn pre-migration is a no-op (nothing to clear).
    expect(decideDisqualify({ outcome: "none", engaged: true, strikes: undefined })).toEqual({ kind: "none" });
  });
});
