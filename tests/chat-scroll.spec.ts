import { describe, it, expect } from "vitest";
import { callArgs, code, read, sourceFiles } from "./helpers/source";
import { isNearBottom, nextPinned, NEAR_BOTTOM_PX } from "@/lib/chat-scroll";

/**
 * Phase 5 criterion 1: sending a reply while scrolled up in a thread no longer
 * moves the scroll, and replying at the bottom still pins.
 *
 * isNearBottom and nextPinned are pure and unit-tested. The rest only shows in
 * a browser, so it is held here by STATIC assertions on the source, like
 * cache-live-reads.spec.ts, with comments stripped by TypeScript's parser first
 * so prose can neither satisfy nor break a rule. The owner's Playwright check
 * proves the behaviour. CRLF-safe: each argument is trimmed before an
 * end-anchored match.
 */

const box = (scrollHeight: number, scrollTop: number, clientHeight: number) => ({
  scrollHeight,
  scrollTop,
  clientHeight,
});

describe("isNearBottom", () => {
  it("is true at the exact bottom", () => {
    expect(isNearBottom(box(2000, 1400, 600))).toBe(true);
  });
  it("is true just inside the threshold", () => {
    expect(isNearBottom(box(2000, 1400 - (NEAR_BOTTOM_PX - 1), 600))).toBe(true);
  });
  it("is false at the threshold and anywhere further up", () => {
    expect(isNearBottom(box(2000, 1400 - NEAR_BOTTOM_PX, 600))).toBe(false);
    expect(isNearBottom(box(2000, 0, 600))).toBe(false);
  });
  it("is true when the content fits without scrolling", () => {
    expect(isNearBottom(box(400, 0, 600))).toBe(true);
  });
  it("tolerates the fractional scrollTop a zoomed browser reports", () => {
    expect(isNearBottom(box(2000, 1399.5, 600))).toBe(true);
  });
  it("honours an explicit threshold", () => {
    expect(isNearBottom(box(2000, 1300, 600), 100)).toBe(false);
    expect(isNearBottom(box(2000, 1300, 600), 101)).toBe(true);
  });
});

describe("nextPinned", () => {
  it("near the bottom always follows, whatever came before", () => {
    expect(nextPinned(false, box(2000, 1400, 600), 1500)).toBe(true);
    expect(nextPinned(false, box(2000, 1400, 600), 0)).toBe(true);
  });
  it("a scroll UP away from the bottom stops following", () => {
    expect(nextPinned(true, box(2000, 900, 600), 1400)).toBe(false);
  });
  it("our own pin landing short, because the next attachment already grew the thread, keeps following", () => {
    // Pinned from 1100 to 1400 of 2000, but by the time the pin's scroll event
    // runs another image has added 300px: 300px short, yet scrollTop only rose.
    expect(nextPinned(true, box(2300, 1400, 600), 1100)).toBe(true);
  });
  it("an event that leaves scrollTop where it was keeps the previous state", () => {
    expect(nextPinned(true, box(2300, 1400, 600), 1400)).toBe(true);
    expect(nextPinned(false, box(2300, 1400, 600), 1400)).toBe(false);
  });
  it("scrolling down through history without reaching the bottom stays unpinned", () => {
    expect(nextPinned(false, box(2000, 1000, 600), 800)).toBe(false);
  });
});

const CHAT_SCROLL = "components/dashboard/chat-scroll.tsx";

describe("ChatScroll moves the scroll only while the reader is following", () => {
  const src = code(CHAT_SCROLL);

  it("every effect has a dependency array, so none runs after every render", () => {
    const effects = [...callArgs(src, "useEffect"), ...callArgs(src, "useLayoutEffect")];
    expect(effects.length).toBeGreaterThan(0);
    for (const args of effects) {
      expect(args.trim(), `effect without a dependency array:\n${args}`).toMatch(/\]$/);
    }
  });

  it("exactly one effect depends on count, and it pins only when pinned", () => {
    const onCount = callArgs(src, "useLayoutEffect").filter((a) => /\[count\]$/.test(a.trim()));
    expect(onCount).toHaveLength(1);
    expect(onCount[0]).toMatch(/if \(el && pinned\.current\) el\.scrollTop = el\.scrollHeight;/);
  });

  it("every scrollTop write is guarded by the pinned ref", () => {
    const writes = src.match(/\.scrollTop\s*=(?!=)/g) ?? [];
    const guarded = src.match(/if \((?:el && )?pinned\.current\) el\.scrollTop\s*=(?!=)/g) ?? [];
    expect(writes.length).toBeGreaterThan(0);
    expect(guarded).toHaveLength(writes.length);
  });

  it("records whether the reader is following on every scroll, before any update lands", () => {
    expect(src).toMatch(/addEventListener\("scroll", onScroll/);
    expect(src).toMatch(/pinned\.current = nextPinned\(pinned\.current, el, lastTop\.current\);/);
    expect(src).toMatch(/lastTop\.current = el\.scrollTop;/);
    expect(src).toMatch(/from "@\/lib\/chat-scroll"/);
    // Decide from the PREVIOUS scrollTop, then record the new one. Swapped,
    // nextPinned always sees no movement and a reader scrolling up never unpins.
    expect(src).toMatch(
      /pinned\.current = nextPinned\(pinned\.current, el, lastTop\.current\);\s*lastTop\.current = el\.scrollTop;/
    );
    // Opens pinned: no scroll event fires on mount, so false would open at the top.
    expect(src).toMatch(/const pinned = useRef\(true\);/);
  });

  it("the pin trusts the state from the last scroll and never re-measures after the update", () => {
    // Measuring after the commit (the audit's version) counts the new message's
    // own height against the reader: a tall reply would unpin someone sitting
    // right at the bottom.
    const writes = src.match(/\bpinned\.current\s*(?:\|\||&&|\?\?)?=(?!=)/g) ?? [];
    expect(writes).toHaveLength(1);
    const onCount = callArgs(src, "useLayoutEffect").filter((a) => /\[count\]$/.test(a.trim()));
    expect(onCount).toHaveLength(1);
    expect(onCount[0]).not.toMatch(/isNearBottom|clientHeight/);
  });

  it("follows attachments that finish loading after the pin", () => {
    expect(src).toMatch(/addEventListener\("load", follow, true\)/);
    expect(src).toMatch(/addEventListener\("loadedmetadata", follow, true\)/);
  });

  it("follows the scroller shrinking (composer appears, header grows) while pinned", () => {
    expect(src).toMatch(/new ResizeObserver\(follow\)/);
    expect(src).toMatch(/\bro\?\.observe\(el\)/);
    expect(src).toMatch(/\bro\?\.disconnect\(\)/);
  });

  it("count is a required prop, so tsc flags any call site that omits it", () => {
    expect(src).toMatch(/\bcount: number;/);
    expect(src).not.toMatch(/\bcount\?:/);
  });
});

describe("every ChatScroll call site passes its message count", () => {
  const SITES: Record<string, RegExp> = {
    "app/(dashboard)/conversations/[id]/page.tsx": /\bcount=\{\(messages \?\? \[\]\)\.length\}/,
    "components/dashboard/bot-trainer.tsx": /\bcount=\{messages\.length\}/,
    "components/dashboard/request-chat.tsx": /\bcount=\{messages\.length\}/,
  };

  it("the importers are exactly the three reviewed here", () => {
    const importers = sourceFiles().filter((f) =>
      /from ["'](?:@\/components\/dashboard|\.)\/chat-scroll["']/.test(read(f))
    );
    expect(importers.sort()).toEqual(Object.keys(SITES).sort());
  });

  for (const [file, count] of Object.entries(SITES)) {
    it(`${file} renders one ChatScroll with its message count`, () => {
      const tags = code(file).match(/<ChatScroll\b[^>]*>/g) ?? [];
      expect(tags).toHaveLength(1);
      expect(tags[0]).toMatch(count);
    });
  }
});
