import { describe, it, expect } from "vitest";
import { detectSpam, spamHostsInText, SPAM_PHRASES } from "@/lib/spam-detect";

/**
 * Deterministic promo/referral spam backstop under the AI disqualify screen.
 *
 * The regression that motivated it: a Temu "Accept my invitation to win free
 * items 🎁 https://temu.com/s/..." DM arriving AFTER the bot had already replied
 * got a NORMAL reply, because the one-word AI screener didn't call it `spam`
 * (mainstream-referral, not the crypto-casino archetype its prompt lists), and a
 * `bot` mis-vote is downgraded to `none` for an engaged lead. detectSpam is the
 * deterministic floor that forces `spam` regardless of the model.
 *
 * A wrongful silence is TERMINAL, so the false-positive carve-outs below are as
 * important as the true positives - a real lead who merely shares a link, asks
 * about a free guide, or mentions a gift card must NEVER be flagged.
 */

describe("detectSpam - the reported Temu incident", () => {
  it("flags the referral card text", () => {
    const r = detectSpam("🥺Plzzz...Accept my invitation! Let's win free items together 💰");
    expect(r.isSpam).toBe(true);
    expect(r.patterns).toContain("accept my invitation");
    expect(r.patterns).toContain("win free items");
  });

  it("flags the referral link message (phrase + host)", () => {
    const r = detectSpam("📢 Accept my invitation to win free items🎁👉 https://temu.com/s/cWI05Ouoa211m");
    expect(r.isSpam).toBe(true);
    expect(r.patterns).toContain("host:temu.com");
    expect(r.patterns).toContain("accept my invitation");
  });

  it("flags on the host alone even with no spam phrase (language-agnostic)", () => {
    const r = detectSpam("mira esto https://temu.com/s/abc123");
    expect(r.isSpam).toBe(true);
    expect(r.patterns).toContain("host:temu.com");
  });
});

describe("detectSpam - promo/referral/giveaway/crypto families", () => {
  const spam = [
    "claim your prize now!!",
    "🎉 Congratulations you won a $500 gift card",
    "exclusive gift just for you",
    "sign up with my link and we both earn",
    "use my referral and get $10",
    "guaranteed profit with our trading signals",
    "double your money in 24h with crypto investment",
    "free spins + casino bonus waiting",
    "invite friends to earn rewards",
  ];
  for (const msg of spam) {
    it(`flags: ${msg.slice(0, 40)}`, () => {
      expect(detectSpam(msg).isSpam).toBe(true);
    });
  }
});

describe("detectSpam - Spanish parity (accent-folded)", () => {
  const spam = [
    "Acepta mi invitación para ganar artículos gratis",
    "Reclama tu premio ahora",
    "Regalo gratis, usa mi enlace",
    "Has ganado un premio, regístrate con mi enlace",
  ];
  for (const msg of spam) {
    it(`flags: ${msg.slice(0, 40)}`, () => {
      expect(detectSpam(msg).isSpam).toBe(true);
    });
  }
});

describe("detectSpam - false-positive carve-outs (real leads, must NOT flag)", () => {
  const legit = [
    "how do I claim your free guide?",              // "claim your free" is NOT a phrase
    "do you have a referral code I can use?",         // bare "referral code" excluded
    "is there a gift card option for paying?",        // bare "gift card" excluded
    "I'm interested in your investment opportunity",   // excluded phrase
    "can I get the free consultation you mentioned?",  // no phrase
    "let me double check my credit report first",      // "double" != "double your money"
    "here's my business https://myrealtybiz.com",      // legit URL, host not blocklisted
    "check out my store https://contemu.com/sale",     // near-miss host, NOT temu.com
    "I saw your ad, how much does funding cost?",       // ordinary lead
    "invite your friends and family to the webinar",    // "invite your friends" not the earn-anchored phrase
    "nothing right now, thanks",                        // benign
    "quiero limpiar mi crédito, es gratis la consulta?", // ES legit ("free consultation?")
  ];
  for (const msg of legit) {
    it(`does NOT flag: ${msg.slice(0, 40)}`, () => {
      const r = detectSpam(msg);
      expect(r.isSpam).toBe(false);
      expect(r.patterns).toEqual([]);
    });
  }
});

describe("spamHostsInText - suffix matching", () => {
  it("matches the host and subdomains, not look-alikes", () => {
    expect(spamHostsInText("https://temu.com/s/x")).toEqual(["temu.com"]);
    expect(spamHostsInText("https://share.temu.com/x")).toEqual(["temu.com"]);
    expect(spamHostsInText("https://temu.to/abc")).toEqual(["temu.to"]);
    expect(spamHostsInText("https://contemu.com/x")).toEqual([]); // not a subdomain of temu.com
    expect(spamHostsInText("https://mytemu.com.evil.io/x")).toEqual([]);
    expect(spamHostsInText("no links here")).toEqual([]);
  });
});

describe("detectSpam - fail-open on bad input", () => {
  it("returns not-spam for empty/whitespace/non-string", () => {
    for (const v of ["", "   ", null, undefined, 42, {}, []] as unknown[]) {
      const r = detectSpam(v as string);
      expect(r.isSpam).toBe(false);
      expect(r.patterns).toEqual([]);
    }
  });
});

describe("SPAM_PHRASES - list hygiene", () => {
  it("has no exact duplicates", () => {
    expect(new Set(SPAM_PHRASES).size).toBe(SPAM_PHRASES.length);
  });
  it("is all lowercase (matched against normalized text)", () => {
    for (const p of SPAM_PHRASES) expect(p).toBe(p.toLowerCase());
  });
});
