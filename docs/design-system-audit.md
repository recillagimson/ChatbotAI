# The existing design system, extracted

This is what was already in the codebase before Aurum. It is written down here
because the new system (`docs/design-system-aurum.md`) was derived from it, and
because the two now ship side by side — knowing which one a screen is on is the
difference between a one-line token change and an afternoon of hunting hexes.

## Name

Unnamed in-repo. Called **SpeedSettr Indigo** in this document for contrast.

## Where it lives

| Layer | File |
| --- | --- |
| Semantic tokens (HSL) | `app/globals.css` → `:root` and `.dark` |
| Literal palette | `tailwind.config.ts` → `colors.ss.*` |
| Fonts | `app/layout.tsx` (`next/font/google`) |
| Radii, shadows | `tailwind.config.ts` |
| Utilities | `app/globals.css` → `@layer utilities` |
| Primitives | `components/ui/*` (shadcn-derived), `components/ss/*` (dashboard-specific) |

## Colour

Two parallel systems, deliberately:

1. **shadcn HSL tokens** (`--background`, `--primary`, `--muted`, …) drive the
   marketing site, auth pages and admin area, and are themeable — `.dark`
   redefines all of them.
2. **A raw-hex `ss.*` ramp** (~60 entries) drives the dashboard. The config
   comments say why: the dashboard blueprint is light-theme-only ("the navy is
   doing the dark work"), so pinning literals keeps every screen pixel-identical
   to the design.

Core hues: primary indigo `#6366f1`, deep navy `#1e1b4b`, page ground `#f6f7fc`,
hairline `#e7e8f3`. The marketing/auth canvas is a darker `#15123a`.

Semantic status colours are green `#059669`, amber `#d97706`, rose `#e11d48`,
plus per-channel chips (IG pink, FB blue).

## Type

- Display: **Outfit** (400–800) via `--font-display`, used for headings, the
  wordmark, and every metric (its tabular figures stop stat cards jittering).
- Body: **Plus Jakarta Sans** (400–700) via `--font-sans`.
- Two utilities carry the type conventions: `.ss-num` (tabular, −0.01em) and
  `.ss-eyebrow` (10.5px, 0.1em tracking, uppercase).

## Radii

A tight custom ladder on top of the shadcn `--radius`: controls `ctl` 9px /
`ctl-lg` 11px, then `chip` 12, `panel` 14, `card` 16, `card-lg` 18.

## Elevation

Six named shadows, each for one specific surface rather than a general scale:
`ss-nav` (active sidebar item), `ss-card`, `ss-pick` (selected chatbot),
`ss-pop` (switcher popover), `ss-plan` (billing card), `ss-sheet` (mobile sheet).

## Motion

CSS keyframes only, all in `globals.css`, all disabled under
`prefers-reduced-motion`: `rise`, `drift`, `pop`, `dot`, `float`, `shimmer`,
`blink`, plus a JS-gated scroll reveal (`[data-motion]` / `[data-reveal]`, 95ms
sibling stagger) driven by `components/landing/scroll-motion.tsx`.

## Texture

`.grain` — an SVG `feTurbulence` overlay at 0.04 opacity on dark surfaces, plus
the focus-ring and autofill fixes that dark canvas needs.

## What was worth keeping

Aurum inherits four ideas from this system rather than reinventing them:

- **A JS-gated scroll reveal**, where the hidden state cannot outlive the script
  that set it — so a failed bundle can never leave content invisible.
- **Tabular figures for every metric**, for the same anti-jitter reason.
- **An eyebrow utility** as a real type style rather than ad-hoc classes.
- **A tight radius ladder** instead of Tailwind's default scale.

## What Aurum does differently, and why

| | Indigo | Aurum |
| --- | --- | --- |
| Accent | Indigo used broadly — nav, chips, links, buttons, charts | Gold used **only** on CTAs and key numbers, so it stays a signal |
| Ground | Cool `#f6f7fc`; dark canvas `#15123a` | Warm `#F6F5F1`; one dark plane, and it is the ink colour |
| Text | `#1e1b4b` navy | `#1A1916` warm near-black |
| Fonts | Two Google webfonts | Platform font (SF/Segoe/Roboto), no download |
| Tokens | HSL vars **and** ~60 raw hexes | One CSS-var layer; Tailwind aliases point at it |
| Shadows | Six per-surface, single-layer | Four-step scale, warm-tinted, two-layer |
| Motion | CSS keyframes | CSS for hover/colour; a real spring for anything grabbable |
| Scope | Global `:root` | Scoped to `.aurum` so both can ship at once |
