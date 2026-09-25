import { describe, it, expect } from "vitest";
import { customRangeToPush, isCompleteDay } from "@/lib/stats-range";
import { resolveRange } from "@/lib/analytics";
import { code } from "./helpers/source";

/**
 * Phase 5, 05-02: the custom date range on /statistics survives being edited.
 *
 * The bug: the date inputs were bound straight to the range the server echoed
 * back, and every input event navigated. A native date input reports "" while
 * a segment is half-typed, and Chromium reports a complete but wrong date after
 * the first digit of a year (0002-05-01) or a month (2026-01-01 on the way to
 * 12). Each of those went to the URL; resolveRange() rejected the empty or
 * backwards ones and fell back to the 30-day preset, and both inputs rendered
 * empty. Separately, because router.push is a transition, React put the old
 * value back into the input after every keystroke, so a range could not be
 * entered from a preset at all.
 *
 * The value sequences below were recorded from Chromium 148 (Playwright,
 * en-US) on a real <input type="date">, one keystroke per value.
 */

type Range = { from: string; to: string };

/** What the bar does on each input event: update the draft, push only a real range. */
function replay(start: Range, which: "from" | "to", values: string[]) {
  let draft = { ...start };
  let sent = { ...start };
  const pushes: Range[] = [];
  for (const value of values) {
    draft = { ...draft, [which]: value };
    const range = customRangeToPush(draft.from, draft.to, sent);
    if (range) {
      sent = range;
      pushes.push(range);
    }
  }
  return { draft, pushes };
}

const MAY = { from: "2026-05-01", to: "2026-05-31" };

describe("isCompleteDay", () => {
  it("accepts a real yyyy-mm-dd day", () => {
    expect(isCompleteDay("2026-05-01")).toBe(true);
    expect(isCompleteDay("2028-02-29")).toBe(true);
  });

  it("rejects the empty value a date input reports mid-edit", () => {
    expect(isCompleteDay("")).toBe(false);
  });

  it("rejects the partial years Chromium reports while a year is typed", () => {
    for (const v of ["0002-05-01", "0020-05-01", "0202-05-01"]) {
      expect(isCompleteDay(v), v).toBe(false);
    }
  });

  it("rejects anything that is not yyyy-mm-dd or does not parse", () => {
    for (const v of ["2026-5-1", "20255-05-01", "2026-13-01", "not-a-date", "2026-05-01T00:00"]) {
      expect(isCompleteDay(v), v).toBe(false);
    }
  });

  it("rejects a day the month does not have, which Date would roll over", () => {
    for (const v of ["2026-02-29", "2026-02-30", "2026-04-31"]) {
      expect(isCompleteDay(v), v).toBe(false);
    }
  });
});

describe("customRangeToPush", () => {
  it("returns the range when both ends are complete and in order", () => {
    expect(customRangeToPush("2026-04-01", "2026-05-31", MAY)).toEqual({
      from: "2026-04-01",
      to: "2026-05-31",
    });
  });

  it("allows a single-day range", () => {
    expect(customRangeToPush("2026-05-09", "2026-05-09", MAY)).toEqual({
      from: "2026-05-09",
      to: "2026-05-09",
    });
  });

  it("holds an incomplete end locally", () => {
    expect(customRangeToPush("", "2026-05-31", MAY)).toBeNull();
    expect(customRangeToPush("2026-05-01", "", MAY)).toBeNull();
    expect(customRangeToPush("0002-05-01", "2026-05-31", MAY)).toBeNull();
  });

  it("holds a backwards range locally", () => {
    expect(customRangeToPush("2026-05-31", "2026-05-01", MAY)).toBeNull();
  });

  it("does not push the range that is already committed or already on its way", () => {
    expect(customRangeToPush(MAY.from, MAY.to, MAY)).toBeNull();
  });

  it("never pushes a range the page would reject and replace with the 30-day preset", () => {
    const days = [
      "", "0002-05-01", "0202-05-31", "2026-01-01", "2026-02-28", "2026-02-30", "2026-03-01",
      "2026-04-31", "2026-05-01", "2026-05-31", "2026-12-31", "2027-05-31", "2028-02-29",
    ];
    const none = { from: "", to: "" };
    for (const from of days) {
      for (const to of days) {
        const range = customRangeToPush(from, to, none);
        if (!range) continue;
        const resolved = resolveRange(range);
        expect(resolved.rangeKey, `${from}..${to}`).toBe("custom");
        expect([resolved.customFrom, resolved.customTo]).toEqual([from, to]);
      }
    }
  });
});

describe("replaying recorded Chromium keystrokes on an existing May range", () => {
  it("month 05 -> 06 on From: the '0' reports empty and must not navigate", () => {
    const { draft, pushes } = replay(MAY, "from", ["", "2026-06-01"]);
    expect(draft).toEqual({ from: "2026-06-01", to: "2026-05-31" });
    expect(pushes).toEqual([]); // 2026-06-01 is after 2026-05-31, so it waits for To
  });

  it("month 05 -> 04 on From pushes once, with To kept", () => {
    const { pushes } = replay(MAY, "from", ["", "2026-04-01"]);
    expect(pushes).toEqual([{ from: "2026-04-01", to: "2026-05-31" }]);
  });

  it("year 2026 -> 2025 on From pushes only the finished year", () => {
    const { pushes } = replay(MAY, "from", ["0002-05-01", "0020-05-01", "0202-05-01", "2025-05-01"]);
    expect(pushes).toEqual([{ from: "2025-05-01", to: "2026-05-31" }]);
  });

  it("year 2026 -> 2027 on To pushes only the finished year", () => {
    const { pushes } = replay(MAY, "to", ["0002-05-31", "0020-05-31", "0202-05-31", "2027-05-31"]);
    expect(pushes).toEqual([{ from: "2026-05-01", to: "2027-05-31" }]);
  });

  it("month 05 -> 12 on To: the intermediate 01 is backwards and held", () => {
    const { pushes } = replay(MAY, "to", ["2026-01-31", "2026-12-31"]);
    expect(pushes).toEqual([{ from: "2026-05-01", to: "2026-12-31" }]);
  });

  it("Backspace on a segment clears that input only and navigates nowhere", () => {
    const { draft, pushes } = replay(MAY, "from", [""]);
    expect(draft).toEqual({ from: "", to: "2026-05-31" });
    expect(pushes).toEqual([]);
  });

  it("retyping all of From (04152026) ends on the typed date and skips the partial years", () => {
    const { draft, pushes } = replay(MAY, "from", [
      "", "2026-04-01", "2026-04-15", "0002-04-15", "0020-04-15", "0202-04-15", "2026-04-15",
    ]);
    expect(draft.from).toBe("2026-04-15");
    expect(pushes.at(-1)).toEqual({ from: "2026-04-15", to: "2026-05-31" });
    expect(pushes.every((r) => r.from.startsWith("2026-"))).toBe(true);
  });

  it("typing a range from a preset (both empty) navigates once, when To completes", () => {
    const none = { from: "", to: "" };
    const a = replay(none, "from", ["0002-05-01", "0020-05-01", "0202-05-01", "2026-05-01"]);
    expect(a.pushes).toEqual([]);
    const b = replay(a.draft, "to", ["0002-05-31", "0020-05-31", "0202-05-31", "2026-05-31"]);
    expect(b.pushes).toEqual([{ from: "2026-05-01", to: "2026-05-31" }]);
  });
});

describe("the statistics date controls keep the edit local (static)", () => {
  const BAR = "components/dashboard/stats/stats-controls-bar.tsx";
  const bar = code(BAR);

  /** The body of `function name(...) { ... }`, found by balancing braces. */
  function body(src: string, name: string): string {
    const at = src.indexOf(`function ${name}(`);
    expect(at, `function ${name} not found in ${BAR}`).toBeGreaterThan(-1);
    const open = src.indexOf("{", src.indexOf(")", at));
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1);
    }
    throw new Error(`unbalanced ${name}`);
  }

  it("binds both date inputs to the local draft, not to the server's echo", () => {
    expect(bar).toMatch(/value=\{draft\.from\}/);
    expect(bar).toMatch(/value=\{draft\.to\}/);
    expect(bar).not.toMatch(/value=\{customFrom/);
    expect(bar).not.toMatch(/value=\{customTo/);
  });

  it("the date handler navigates only through customRangeToPush and never clears the range", () => {
    const handler = body(bar, "handleCustomDate");
    expect(handler).toMatch(/customRangeToPush\(/);
    expect(handler).not.toMatch(/from:\s*null/);
    expect(handler).not.toMatch(/to:\s*null/);
  });

  it("the echo of the bar's own navigation never replaces an edit in progress", () => {
    const handler = body(bar, "handleCustomDate");
    expect(handler.indexOf("sent.current = range;")).toBeGreaterThan(-1);
    expect(handler.indexOf("sent.current = range;")).toBeLessThan(handler.indexOf("push("));
    expect(body(bar, "handleRangePill")).toMatch(/sent\.current = \{ from: "", to: "" \};/);
    expect(bar).toMatch(/if \(from === sent\.current\.from && to === sent\.current\.to\) return;/);
    expect(bar).toMatch(/const committedQs = searchParams\.toString\(\);/);
    expect(bar).toMatch(/\}, \[customFrom, customTo, committedQs\]\);/);
  });

  it("every edit lands in the draft first, and the committed range reaches the inputs", () => {
    const handler = body(bar, "handleCustomDate");
    // Without this the controlled inputs snap back on every keystroke.
    expect(handler).toMatch(/setDraft\(next\);/);
    expect(handler.indexOf("setDraft(next)")).toBeLessThan(handler.indexOf("customRangeToPush("));
    // Deduped against what this bar last sent, not against the server's props.
    expect(handler).toMatch(/customRangeToPush\(next\.from, next\.to, sent\.current\)/);
    expect(body(bar, "handleRangePill")).toMatch(/setDraft\(\{ from: "", to: "" \}\);/);
    // A range committed elsewhere (Back, a shared link) replaces the draft;
    // only the echo of this bar's own push is skipped.
    expect(bar).toMatch(
      /if \(from === sent\.current\.from && to === sent\.current\.to\) return;\s*sent\.current = \{ from, to \};\s*setDraft\(\{ from, to \}\);/
    );
  });

  it("only a preset pill clears from and to", () => {
    expect(bar.match(/from:\s*null/g) ?? []).toHaveLength(1);
    expect(body(bar, "handleRangePill")).toMatch(/from:\s*null,\s*to:\s*null/);
  });

  it("keeps lib/analytics out of the client bundle (type-only import)", () => {
    expect(bar).toMatch(/import type \{ RangeKey \} from "@\/lib\/analytics";/);
    expect(bar).not.toMatch(/import \{[^}]*\} from "@\/lib\/analytics"/);
    expect(bar).toMatch(/from "@\/lib\/stats-range"/);
    expect(code("lib/stats-range.ts")).not.toMatch(/^\s*import\s/m);
  });

  it("the page still remounts the report only when the URL range or scope changes", () => {
    const page = code("app/(dashboard)/statistics/page.tsx");
    expect(page).toMatch(/const reportKey = \[sp\.range, sp\.from, sp\.to, sp\.bot\]\.join\("\|"\);/);
    expect(page).toMatch(/<Suspense key=\{reportKey\}/);
    expect(page).toMatch(/customFrom=\{customFrom\}/);
    expect(page).toMatch(/customTo=\{customTo\}/);
  });
});
