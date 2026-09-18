import type { Metadata } from "next";
import {
  AuButton,
  AuCard,
  AuEyebrow,
  AuPill,
  AuRule,
  AuSection,
  AuStat,
} from "@/components/aurum/primitives";

/**
 * The Aurum specimen sheet.
 *
 * A design system that only exists inside a marketing page is not a system,
 * it is a layout. This page renders every token and primitive on one screen so
 * a change to styles/aurum.css can be judged in one scroll, and so the next
 * person to build a surface can see what already exists before inventing a
 * sixth grey.
 */

export const metadata: Metadata = {
  title: "Aurum design system | SpeedSettr",
  description: "Tokens, type scale and primitives for the Aurum design system.",
  // A specimen sheet must never rank in place of a real page.
  robots: { index: false, follow: false },
};

const SWATCHES: { name: string; token: string; note: string }[] = [
  { name: "Canvas", token: "--au-canvas", note: "#F6F5F1 · the page ground" },
  { name: "Canvas sunk", token: "--au-canvas-sunk", note: "#EFEDE5 · wells" },
  { name: "Surface", token: "--au-surface", note: "#FDFCFA · cards" },
  { name: "Ink", token: "--au-ink", note: "#1A1916 · headings" },
  { name: "Ink 2", token: "--au-ink-2", note: "#57544C · body" },
  { name: "Ink 3", token: "--au-ink-3", note: "#8A867C · captions" },
  { name: "Gold", token: "--au-gold", note: "#F0B429 · CTA fill, key numbers" },
  { name: "Gold ink", token: "--au-gold-ink", note: "#A06E08 · gold text ≥18px" },
  { name: "Gold ink sm", token: "--au-gold-ink-sm", note: "#7A5406 · small gold text" },
  { name: "Gold wash", token: "--au-gold-wash", note: "#FDF3DC · chips" },
  { name: "Line", token: "--au-line", note: "#E5E2D8 · the hairline" },
  { name: "Obsidian", token: "--au-obsidian", note: "#1A1916 · contrast plane" },
];

const TYPE = [
  { cls: "au-display", label: "Display", spec: "clamp 40→68px · −0.035em · 1.02" },
  { cls: "au-title-1", label: "Title 1", spec: "clamp 32→48px · −0.028em · 1.07" },
  { cls: "au-title-2", label: "Title 2", spec: "clamp 24→30px · −0.02em · 1.18" },
  { cls: "au-title-3", label: "Title 3", spec: "19px · −0.012em · 1.3" },
  { cls: "au-body-lg", label: "Body large", spec: "17px · −0.003em · 1.62" },
  { cls: "au-body", label: "Body", spec: "16px · 0 · 1.6" },
  { cls: "au-callout", label: "Callout", spec: "15px · 0 · 1.53" },
  { cls: "au-caption", label: "Caption", spec: "13px · +0.005em · 1.45" },
];

/** Full literal class names - Tailwind cannot see an interpolated one. */
const SHADOWS: [string, string][] = [
  ["shadow-au-1", "shadow-au-1"],
  ["shadow-au-2", "shadow-au-2"],
  ["shadow-au-3", "shadow-au-3"],
  ["shadow-au-4", "shadow-au-4"],
];

const RADII: [string, string][] = [
  ["rounded-au-chip", "8px"],
  ["rounded-au-ctl", "11px"],
  ["rounded-au-field", "12px"],
  ["rounded-au-card", "18px"],
  ["rounded-au-panel", "22px"],
  ["rounded-au-hero", "28px"],
];

export default function DesignSystemPage() {
  return (
    <main className="pb-24">
      <AuSection>
        <AuEyebrow>Design system</AuEyebrow>
        <h1 className="au-display mt-5 text-au-ink">Aurum</h1>
        <p className="au-body-lg mt-6 max-w-[42rem] text-au-ink-2">
          A warm-neutral system with a single saturated accent. Gold appears on
          calls to action and on numbers that matter, and nowhere else — which
          is what lets it work as a signal rather than as decoration.
        </p>
      </AuSection>

      {/* ------------------------------------------------------- colour */}
      <AuSection tone="sunk">
        <Head title="Colour" note="Twelve of the system's tokens. All of them live in styles/aurum.css; nothing in a component hardcodes a hex." />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SWATCHES.map((s) => (
            <AuCard key={s.token} className="overflow-hidden">
              <div
                className="h-20 border-b border-au-line"
                style={{ background: `var(${s.token})` }}
              />
              <div className="p-4">
                <div className="text-[14px] font-semibold text-au-ink">
                  {s.name}
                </div>
                <div className="au-caption mt-1 text-au-ink-3">{s.note}</div>
                <code className="au-caption mt-2 block text-au-ink-4">
                  var({s.token})
                </code>
              </div>
            </AuCard>
          ))}
        </div>

        <div className="mt-8 rounded-au-card border border-au-gold-line bg-au-gold-tint p-6">
          <AuEyebrow>Contrast note</AuEyebrow>
          <p className="au-callout mt-3 max-w-[46rem] text-au-ink-2">
            <strong className="font-semibold text-au-ink">#A06E08</strong>{" "}
            measures ≈4.4:1 on the surface colour — AA for text at 18px+ or
            semibold 14px+, which is the only place the system uses it. Small
            gold text steps down to{" "}
            <strong className="font-semibold text-au-ink">#7A5406</strong>{" "}
            (≈5.0:1). Gold as a{" "}
            <strong className="font-semibold text-au-ink">fill</strong> carries
            a near-black label at 9.4:1, never white, which would sit at 2.0:1.
          </p>
        </div>
      </AuSection>

      {/* --------------------------------------------------------- type */}
      <AuSection>
        <Head title="Type" note="Platform font. Tracking is size-specific — display sizes tighten, small text loosens — because a single letter-spacing value is wrong somewhere on every scale." />
        <div className="mt-10 space-y-8">
          {TYPE.map((t) => (
            <div key={t.cls}>
              <div className="au-caption text-au-ink-3">
                .{t.cls} — {t.spec}
              </div>
              <p className={`${t.cls} mt-2 text-au-ink`}>
                Answers every DM in under a minute.
              </p>
            </div>
          ))}
          <AuRule />
          <div>
            <div className="au-caption text-au-ink-3">
              .au-eyebrow / .au-num — tabular figures so a ticking number never
              shifts its neighbours
            </div>
            <div className="mt-3 flex flex-wrap items-baseline gap-8">
              <AuEyebrow>Speed to lead · last 7 days</AuEyebrow>
              <span className="au-num text-[40px] leading-none text-au-gold-ink">
                $18,400
              </span>
            </div>
          </div>
        </div>
      </AuSection>

      {/* ----------------------------------------------------- controls */}
      <AuSection tone="sunk">
        <Head title="Buttons" note="One primary style, and it is gold. Every variant gives feedback on pointer-down at 140ms rather than waiting for the click." />
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <AuButton size="xl">Book my call</AuButton>
          <AuButton size="lg">Book my call</AuButton>
          <AuButton>Book my call</AuButton>
          <AuButton size="sm">Book</AuButton>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <AuButton variant="ink">Secondary</AuButton>
          <AuButton variant="outline">Outline</AuButton>
          <AuButton variant="ghost">Ghost</AuButton>
          <AuButton variant="link">Text link</AuButton>
          <AuButton disabled>Disabled</AuButton>
        </div>

        <div className="mt-12">
          <Head title="Pills" />
          <div className="mt-6 flex flex-wrap gap-3">
            <AuPill>Neutral</AuPill>
            <AuPill tone="gold">Gold</AuPill>
            <AuPill tone="good">Live</AuPill>
          </div>
        </div>
      </AuSection>

      {/* ---------------------------------------------- surface & depth */}
      <AuSection>
        <Head title="Surface and elevation" note="The card plane is lighter than the page, which is what makes it read as raised. Shadows are warm-tinted and layered — a contact shadow plus an ambient one — never a single neutral blur." />
        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          {(["flat", "raised", "float"] as const).map((e) => (
            <AuCard key={e} elevation={e} className="p-6">
              <div className="au-caption text-au-ink-3">elevation=&quot;{e}&quot;</div>
              <p className="au-title-3 mt-3 text-au-ink">Surface</p>
            </AuCard>
          ))}
        </div>

        {/* Class names are written out in full rather than interpolated:
            Tailwind scans source text, so `shadow-${s}` would compile to
            nothing and the whole row would render flat. */}
        <div className="mt-10 grid gap-5 sm:grid-cols-4">
          {SHADOWS.map(([cls, name]) => (
            <div
              key={name}
              className={`rounded-au-card border border-au-line bg-au-surface p-5 ${cls}`}
            >
              <code className="au-caption text-au-ink-3">{name}</code>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-6">
          {RADII.map(([cls, px]) => (
            <div
              key={cls}
              className={`${cls} border border-au-line bg-au-surface p-4 text-center`}
            >
              <code className="au-caption block text-au-ink-3">{px}</code>
            </div>
          ))}
        </div>
      </AuSection>

      {/* --------------------------------------------------------- stats */}
      <AuSection tone="dark">
        <Head title="On the contrast plane" dark note="One dark surface per page, at most twice. It is the ink colour rather than a new hue, so the page never becomes two-toned." />
        <div className="mt-10 grid gap-10 sm:grid-cols-3">
          <AuStat tone="dark" value="<30s" label="Typical first reply" sub="Every channel, every hour" />
          <AuStat tone="dark" value="3.4×" label="More booked calls" sub="First 60 days" />
          <AuStat tone="dark" value="24/7" label="Never off" sub="Including the 2am ones" />
        </div>
        <div className="mt-10">
          <AuButton size="lg">Gold on obsidian</AuButton>
        </div>
      </AuSection>
    </main>
  );
}

function Head({
  title,
  note,
  dark,
}: {
  title: string;
  note?: string;
  dark?: boolean;
}) {
  return (
    <div className="max-w-[42rem]">
      <h2
        className={`au-title-2 ${dark ? "text-au-on-dark" : "text-au-ink"}`}
      >
        {title}
      </h2>
      {note ? (
        <p
          className={`au-callout mt-3 ${dark ? "text-au-on-dark-2" : "text-au-ink-2"}`}
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}
