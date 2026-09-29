import { describe, it, expect, vi, beforeAll } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { hasUnicodeDash } from "@/lib/sanitize";
import {
  followCoverage,
  type FollowDay,
  type FollowPause,
  type FollowReport,
  type TrackedBot,
} from "@/lib/follows";

/**
 * The Statistics "New Instagram followers" card, rendered to HTML in each of its
 * states. The logic that decides what an owner reads (a change only against a
 * fully tracked period, the notes when a bot's first follow falls inside the
 * range or after it, a feed that went quiet, a bot that isn't recording, a setup
 * link per untracked bot, the chart and its labels) lives in the card, so it is
 * checked on real output, not on source text.
 */

// The setup prompt's "Hide" is a client component that refreshes the router.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

let Card: (typeof import("@/components/dashboard/stats/new-followers-card"))["NewFollowersCard"];
beforeAll(async () => {
  ({ NewFollowersCard: Card } = await import("@/components/dashboard/stats/new-followers-card"));
}, 120_000);

// "Last 30 days" ending Nov 10, 2026: [Oct 11, Nov 10), previous [Sep 11, Oct 11).
const RANGE: Parameters<typeof followCoverage>[1] = {
  prevFrom: "2026-09-11T00:00:00.000Z",
  from: "2026-10-11T00:00:00.000Z",
  to: "2026-11-10T00:00:00.000Z",
  rangeKey: "30d",
};
const NOW = Date.parse("2026-11-10T00:00:00Z");
const NAMES = { b1: "Coach Bot", b2: "Shop Bot" };
const NOT_PAUSED: FollowPause = { planInactive: false, botsOff: [] };

function days(from: string, n: number, perDay = 1): FollowDay[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => ({
    day: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    follows: perDay,
  }));
}

const tracked = (id: string, first: string, last = "2026-11-09T10:00:00+00:00"): TrackedBot => ({
  id,
  firstFollowedAt: first,
  lastFollowedAt: last,
});

function report(over: Partial<FollowReport> = {}): FollowReport {
  const trackedBots = over.trackedBots ?? [tracked("b1", "2026-08-01T10:00:00+00:00")];
  return {
    tracking: true,
    firstFollowedAt: trackedBots[0]?.firstFollowedAt ?? null,
    lastFollowedAt: trackedBots.length
      ? trackedBots.map((b) => b.lastFollowedAt).sort().slice(-1)[0]
      : null,
    follows: 30,
    prevFollows: 20,
    messaged: 6,
    series: days("2026-10-11", 30),
    latest: [
      {
        username: "maria.fit",
        display_name: "Maria Lopez",
        followed_at: "2026-11-09T10:00:00+00:00",
        conversation_id: "conv-1",
        messaged: true,
      },
      {
        username: "sam.lifts",
        display_name: null,
        followed_at: "2026-11-08T10:00:00+00:00",
        conversation_id: null,
        messaged: false,
      },
    ],
    ...over,
    trackedBots,
  };
}

function render(
  r: FollowReport,
  opts: {
    delta?: string;
    deltaTone?: "good" | "bad";
    setup?: { name: string; href: string }[];
    paused?: FollowPause;
    now?: number;
    range?: typeof RANGE;
  } = {}
): string {
  return renderToStaticMarkup(
    createElement(Card, {
      report: r,
      coverage: followCoverage(r, opts.range ?? RANGE, opts.now ?? NOW),
      delta: opts.delta,
      deltaTone: opts.deltaTone,
      setup: opts.setup ?? [],
      paused: opts.paused ?? NOT_PAUSED,
      botNames: NAMES,
      accountId: "acct-1",
    })
  );
}

/** Visible text: tags dropped, entities decoded, whitespace collapsed. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

describe("the follower card: tracking", () => {
  it("shows the count, the change, the previous period and who started a conversation", () => {
    const t = text(render(report(), { delta: "+50%", deltaTone: "good" }));
    expect(t).toContain("New Instagram followers");
    expect(t).toContain("30");
    expect(t).toContain("+50%");
    expect(t).toContain("20 last period");
    expect(t).toContain("6 of them started a conversation (20%).");
    expect(t).not.toMatch(/first follow was recorded|last follow was recorded|Not tracked yet|Nothing is being recorded/);
  });

  it("never shows the previous period when tracking didn't cover all of it", () => {
    // Set up on Oct 10: the previous period [Sep 11, Oct 11) holds one tracked day.
    const r = report({ trackedBots: [tracked("b1", "2026-10-10T09:00:00+00:00")], prevFollows: 1 });
    expect(followCoverage(r, RANGE, NOW).previousComparable).toBe(false);
    const t = text(render(r));
    expect(t).not.toContain("last period");
    expect(t).not.toMatch(/[+-]\d+%/);
  });

  it("says when the first follow was recorded inside the range, without claiming more than the data knows", () => {
    const r = report({ trackedBots: [tracked("b1", "2026-10-20T09:00:00+00:00")], series: days("2026-10-20", 21) });
    const t = text(render(r));
    expect(t).toContain(
      "The first follow was recorded on Oct 20, 2026, so earlier days in this range may not have been counted."
    );
  });

  it("All chatbots: names the bot that started inside the range and shows no change", () => {
    const r = report({
      trackedBots: [tracked("b1", "2026-08-01T10:00:00+00:00"), tracked("b2", "2026-10-25T10:00:00+00:00")],
      follows: 94,
      prevFollows: 14,
    });
    const coverage = followCoverage(r, RANGE, NOW);
    expect(coverage.previousComparable).toBe(false);
    const t = text(render(r));
    expect(t).toContain(
      "Shop Bot recorded its first follow on Oct 25, 2026, so its earlier days in this range may not have been counted."
    );
    expect(t).not.toContain("Coach Bot recorded");
    expect(t).not.toContain("last period");
  });

  it("a range that ended before the first recorded follow reads as nothing recorded, not as nobody followed", () => {
    const r = report({
      trackedBots: [tracked("b1", "2026-11-15T09:00:00+00:00", "2026-11-20T09:00:00+00:00")],
      follows: 0,
      prevFollows: 0,
      messaged: 0,
      series: [],
      latest: [],
    });
    const t = text(render(r, { now: Date.parse("2026-11-21T00:00:00Z") }));
    expect(t).toContain("The first follow was recorded on Nov 15, 2026, after this range, so there is nothing to count here.");
    expect(t).toContain("No follows were recorded in this range.");
    expect(t).not.toContain("No new followers recorded in this range.");
    expect(t).not.toMatch(/ManyChat reported/);
  });

  it("a feed quiet for a week or more says when the last follow came and what to check, Meta included", () => {
    const r = report({
      trackedBots: [tracked("b1", "2026-08-01T10:00:00+00:00", "2026-10-02T09:00:00+00:00")],
      follows: 0,
      messaged: 0,
      series: days("2026-10-11", 30, 0),
      latest: [],
    });
    const t = text(render(r));
    expect(t).toContain("No new followers recorded in this range.");
    expect(t).toContain("The last follow was recorded on Oct 2, 2026.");
    expect(t).toContain('"Say hi to new followers" automation is live');
    expect(t).toContain("Meta can also pause this trigger");
  });

  it("says plainly when nothing is being recorded right now, and why", () => {
    expect(text(render(report(), { paused: { planInactive: true, botsOff: [] } }))).toContain(
      "Nothing is being recorded while your plan is inactive."
    );
    expect(text(render(report(), { paused: { planInactive: false, botsOff: ["Shop Bot"] } }))).toContain(
      "Nothing is being recorded for Shop Bot while its AI replies are off."
    );
    expect(text(render(report(), { paused: { planInactive: false, botsOff: ["Coach Bot", "Shop Bot"] } }))).toContain(
      "Nothing is being recorded for Coach Bot and Shop Bot while their AI replies are off."
    );
  });

  it("links the latest followers who started a conversation to it", () => {
    const html = render(report());
    expect(html).toContain('href="/conversations/conv-1"');
    expect(text(html)).toContain("Open chat");
    expect(text(html)).toContain("@sam.lifts");
    expect(html.match(/Open chat/g) ?? []).toHaveLength(1);
  });

  it("lists every untracked Instagram bot in scope with its own setup link", () => {
    const html = render(report(), {
      setup: [
        { name: "Coach Bot", href: "/chatbots/b2?tab=connection#followers" },
        { name: "Shop Bot", href: "/chatbots/b3?tab=connection#followers" },
      ],
    });
    expect(text(html)).toContain("Not tracked yet: Coach Bot , Shop Bot .");
    expect(html).toContain('href="/chatbots/b2?tab=connection#followers"');
    expect(html).toContain('href="/chatbots/b3?tab=connection#followers"');
  });

  it("the coverage note names the real rule", () => {
    const t = text(render(report()));
    expect(t).toContain("ManyChat only reports people who weren't already your ManyChat contacts");
    expect(t).toContain("comment-to-DM");
    expect(t).toContain("the least you gained, not your exact total");
  });
});

describe("the follower card: the chart", () => {
  const axis = (html: string) =>
    [...html.matchAll(/<div class="mt-2 flex justify-between[^"]*">(.*?)<\/div>/g)].flatMap((m) =>
      [...m[1].matchAll(/<span>([^<]*)<\/span>/g)].map((s) => s[1])
    );

  it("a month keeps one bar per day with tight gaps, labelled to its real last day", () => {
    const html = render(report({ series: days("2026-10-11", 31) }));
    expect(html).toContain("gap-[2px]");
    const labels = axis(html);
    expect(labels).toHaveLength(3);
    expect(labels[2]).toBe("11/10");
  });

  it("a week keeps the roomy default gap", () => {
    const html = render(report({ series: days("2026-11-03", 8), follows: 8 }));
    expect(html).not.toMatch(/gap-\[(2|4)px\]/);
  });

  it("only a chart longer than a year labels months with the year", () => {
    const long = render(report({ trackedBots: [tracked("b1", "2025-01-01T00:00:00+00:00")], series: days("2025-10-01", 400) }));
    expect(axis(long)).toEqual(["Oct 2025", "Apr 2026", "Nov 2026"]);
    // A week across New Year keeps its days.
    const week = render(report({ trackedBots: [tracked("b1", "2025-01-01T00:00:00+00:00")], series: days("2026-12-27", 7), follows: 7 }));
    expect(axis(week)).toEqual(["12/27", "12/30", "01/02"]);
  });

  it("an oldest bar that covers fewer days is drawn at its daily rate, not as a drop", () => {
    // 41 days at a flat 3 a day: the oldest bar covers 1 day, the rest 2.
    const html = render(report({ series: days("2026-09-30", 41, 3), follows: 123 }));
    const heights = [...html.matchAll(/height:(\d+(?:\.\d+)?)%/g)].map((m) => Number(m[1]));
    expect(heights).toHaveLength(21);
    expect(new Set(heights)).toEqual(new Set([100]));
  });

  it("in the first days of tracking there is no chart of one or two slabs, just a note", () => {
    const r = report({ trackedBots: [tracked("b1", "2026-11-08T12:00:00+00:00")], series: days("2026-11-08", 2), follows: 3 });
    const html = render(r);
    expect(html).not.toMatch(/height:\d+(\.\d+)?%/);
    expect(text(html)).toContain("The daily chart fills in as more days are tracked.");
    // A long-tracked bot on a short range still gets its chart.
    const short = render(report({ series: days("2026-11-09", 1), follows: 2 }));
    expect(short).toMatch(/height:\d+(\.\d+)?%/);
  });

  it("a range that has ended draws the days it tracked instead of promising more", () => {
    // Last month [Aug 1, Sep 1), viewed in September, with the first follow on Aug 31
    // (the Test Request of an owner who set up that day).
    const lastMonth: typeof RANGE = {
      prevFrom: "2026-07-01T00:00:00.000Z",
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-09-01T00:00:00.000Z",
      rangeKey: "lastmonth",
    };
    const r = report({
      trackedBots: [tracked("b1", "2026-08-31T10:00:00+00:00", "2026-09-20T10:00:00+00:00")],
      series: days("2026-08-31", 1, 2),
      follows: 2,
      messaged: 1,
    });
    const html = render(r, { range: lastMonth, now: Date.parse("2026-09-15T12:00:00Z") });
    expect(text(html)).toContain(
      "The first follow was recorded on Aug 31, 2026, so earlier days in this range may not have been counted."
    );
    expect(text(html)).not.toContain("fills in");
    expect(html).toMatch(/height:\d+(\.\d+)?%/);
    expect(axis(html)).toEqual(["08/31"]);
  });
});

describe("the follower card: setup", () => {
  const untracked = report({
    tracking: false,
    trackedBots: [],
    follows: 0,
    prevFollows: 0,
    messaged: 0,
    series: [],
    latest: [],
  });

  it("one Instagram bot: a Set it up button to its steps, and a Hide", () => {
    const html = render(untracked, { setup: [{ name: "Coach Bot", href: "/chatbots/b1?tab=connection#followers" }] });
    const t = text(html);
    expect(t).toContain("Track new Instagram followers");
    expect(t).toContain('"Say hi to new followers"');
    expect(html).toContain('href="/chatbots/b1?tab=connection#followers"');
    expect(t).toContain("Set it up");
    expect(html).toContain('aria-label="Hide this prompt"');
  });

  it("several Instagram bots: a link to each one's steps instead of one button", () => {
    const html = render(untracked, {
      setup: [
        { name: "Coach Bot", href: "/chatbots/b1?tab=connection#followers" },
        { name: "Shop Bot", href: "/chatbots/b2?tab=connection#followers" },
      ],
    });
    const t = text(html);
    expect(t).toContain("Set it up on each Instagram chatbot: Coach Bot , Shop Bot .");
    expect(t).not.toMatch(/\bSet it up\b(?! on each)/);
    expect(html).toContain('href="/chatbots/b2?tab=connection#followers"');
  });
});

describe("the follower card: copy", () => {
  it("no em or en dashes in anything it renders", () => {
    const states = [
      render(report(), { delta: "+50%", deltaTone: "good", setup: [{ name: "B", href: "/x" }] }),
      render(report({ trackedBots: [tracked("b1", "2026-10-20T09:00:00+00:00")] })),
      render(report({ trackedBots: [tracked("b1", "2026-08-01T10:00:00+00:00"), tracked("b2", "2026-10-25T10:00:00+00:00")] })),
      render(report({ trackedBots: [tracked("b1", "2026-11-15T09:00:00+00:00", "2026-11-20T09:00:00+00:00")], follows: 0, series: [], latest: [] })),
      render(report({ trackedBots: [tracked("b1", "2026-08-01T10:00:00+00:00", "2026-10-02T09:00:00+00:00")], follows: 0, series: [], latest: [] })),
      render(report(), { paused: { planInactive: false, botsOff: ["A", "B"] } }),
      render(report({ tracking: false, trackedBots: [] }), {
        setup: [{ name: "B", href: "/x" }, { name: "C", href: "/y" }],
      }),
    ];
    for (const html of states) expect(hasUnicodeDash(text(html))).toBe(false);
  });
});
