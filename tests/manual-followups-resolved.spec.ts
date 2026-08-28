import { describe, it, expect } from "vitest";
import { dayBandHiFor, followupResolvedHidden, DAY_BANDS } from "@/lib/manual-followups";

/**
 * The manual-follow-up "Resolved" (per-band dismissal): a user marks the band they're
 * working "done by hand in ManyChat" and the thread hides from that band, then
 * re-surfaces in the NEXT band if the lead still hasn't replied. A lead reply
 * auto-invalidates the resolve (a newer inbound moves the lead clock past it).
 */

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse("2026-08-27T12:00:00.000Z");
const ago = (h: number) => new Date(NOW - h * HOUR).toISOString();

describe("dayBandHiFor", () => {
  it("returns each band's upper edge", () => {
    expect(dayBandHiFor("d1")).toBe(72);
    expect(dayBandHiFor("d3")).toBe(120);
    expect(dayBandHiFor("d5")).toBe(144);
    expect(dayBandHiFor("d7")).toBe(168);
  });
  it("returns null for an unknown band", () => {
    expect(dayBandHiFor("d9")).toBeNull();
    expect(dayBandHiFor("")).toBeNull();
  });
  it("the bands partition [24h, 7d) with no gap", () => {
    expect(DAY_BANDS[0].loHours).toBe(24);
    expect(DAY_BANDS[DAY_BANDS.length - 1].hiHours).toBe(168);
    for (let i = 1; i < DAY_BANDS.length; i++) {
      expect(DAY_BANDS[i].loHours).toBe(DAY_BANDS[i - 1].hiHours);
    }
  });
});

describe("followupResolvedHidden", () => {
  it("a never-resolved thread is not hidden", () => {
    expect(
      followupResolvedHidden({ resolvedAt: null, resolvedHi: null, leadLastMessageAt: ago(48), nowMs: NOW })
    ).toBe(false);
  });

  it("hides a thread resolved in its current band (fresh resolve, still inside the band)", () => {
    // Resolved at the 1-day band (hi 72), lead last spoke 48h ago, resolved 1h ago.
    expect(
      followupResolvedHidden({ resolvedAt: ago(1), resolvedHi: 72, leadLastMessageAt: ago(48), nowMs: NOW })
    ).toBe(true);
  });

  it("stops hiding once the thread ages past the resolved band (reappears in the next band)", () => {
    // Same resolve (hi 72), but the lead has now been silent 80h -> it's in the 3-day band.
    expect(
      followupResolvedHidden({ resolvedAt: ago(30), resolvedHi: 72, leadLastMessageAt: ago(80), nowMs: NOW })
    ).toBe(false);
  });

  it("a lead reply AFTER the resolve invalidates it (fresh sequence)", () => {
    // Resolved 5h ago, but the lead replied 2h ago -> the resolve is stale, thread returns.
    expect(
      followupResolvedHidden({ resolvedAt: ago(5), resolvedHi: 72, leadLastMessageAt: ago(2), nowMs: NOW })
    ).toBe(false);
  });

  it("a half-written state (hi without at, or vice versa) is not hidden", () => {
    expect(
      followupResolvedHidden({ resolvedAt: ago(1), resolvedHi: null, leadLastMessageAt: ago(48), nowMs: NOW })
    ).toBe(false);
    expect(
      followupResolvedHidden({ resolvedAt: null, resolvedHi: 72, leadLastMessageAt: ago(48), nowMs: NOW })
    ).toBe(false);
  });

  it("resolving a later band hides through that band and reappears at the next", () => {
    // Resolved the 3-day band (hi 120): hidden at 100h, back at 121h (5-day band).
    expect(
      followupResolvedHidden({ resolvedAt: ago(1), resolvedHi: 120, leadLastMessageAt: ago(100), nowMs: NOW })
    ).toBe(true);
    expect(
      followupResolvedHidden({ resolvedAt: ago(1), resolvedHi: 120, leadLastMessageAt: ago(121), nowMs: NOW })
    ).toBe(false);
  });
});
