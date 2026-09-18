# Aurum

The conversion design system. Warm neutral ground, near-black text, and a single
saturated accent — gold — reserved for the two things the page wants you to look
at: the call to action, and the numbers that make the case for it.

Live specimen sheet: **`/design-system`**
Funnel built on it: **`/book-a-call`**

## Why it is scoped, not global

Every token lives under `.aurum`, never on `:root`, and the stylesheet is
imported by `app/(funnel)/layout.tsx` rather than `app/globals.css`. The
dashboard, admin console and current marketing site all run on the indigo
shadcn tokens; redefining those would repaint roughly forty screens at once.
Scoping means Aurum can be adopted one route at a time, and both systems render
correctly on the same deploy.

## Files

| Purpose | File |
| --- | --- |
| Tokens, type scale, materials, a11y | `styles/aurum.css` |
| Tailwind aliases (`au-*`) | `tailwind.config.ts` |
| Primitives | `components/aurum/primitives.tsx` |
| Spring, projection, rubber-band, velocity | `components/aurum/motion.ts` |
| Gesture slider | `components/aurum/slider.tsx` |
| Scroll reveal | `components/aurum/reveal.tsx` |
| Funnel sections | `components/funnel/*` |

Tailwind entries point at CSS variables (`canvas: "var(--au-canvas)"`), so
`styles/aurum.css` stays the single source of truth and no component holds a hex.

## Colour

### Ground
| Token | Value | Use |
| --- | --- | --- |
| `--au-canvas` | `#F6F5F1` | The page. Light, and measurably off `#fff`, which would flare under the gold |
| `--au-canvas-sunk` | `#EFEDE5` | Alternating section wells, inset fields |
| `--au-surface` | `#FDFCFA` | Cards — **lighter than the page**, which is what makes them read as raised |
| `--au-surface-raised` | `#FFFFFF` | The topmost float only: popovers, sheets |

### Ink
`#000` reads as a hole punched in warm paper. The ramp is warm near-black:

| Token | Value | Use |
| --- | --- | --- |
| `--au-ink` | `#1A1916` | Headings, primary copy |
| `--au-ink-2` | `#57544C` | Body copy |
| `--au-ink-3` | `#8A867C` | Captions, labels |
| `--au-ink-4` | `#B3AFA3` | Placeholders, disabled |

### Gold
The only saturated hue in the system.

| Token | Value | Use |
| --- | --- | --- |
| `--au-gold` | `#F0B429` | CTA fill, key numbers, progress |
| `--au-gold-ink` | `#A06E08` | Gold **text** at ≥18px or semibold ≥14px |
| `--au-gold-ink-sm` | `#7A5406` | Gold text below that |
| `--au-gold-wash` | `#FDF3DC` | Chips, callouts |
| `--au-gold-line` | `#F0E0B6` | Hairline on gold surfaces |

**Contrast, stated plainly.** `#A06E08` measures **≈4.4:1** on the surface
colour. That clears WCAG AA for large text (18px+, or 14px+ semibold) but is
just under the 4.5:1 needed for small body text — so the system uses it only at
those larger sizes and steps small gold text down to `#7A5406` (**≈5.0:1**). A
gold **fill** always carries a near-black label (**9.4:1**), never white, which
would sit at 2.0:1. That is also why the CTA reads as a lit, physical object.

## Type

The platform font stack (`-apple-system` / SF Pro / Segoe UI / Roboto),
deliberately. Apple's own tracking tables and optical sizing ship inside the
system font; a webfont would cost a render-blocking download to get something
less tuned.

Tracking is **size-specific, never one global value** — letterforms look too far
apart as they grow, so display sizes tighten and small text loosens. Leading
moves inversely to size. Everything is in `rem`, so raising the browser text size
scales the layout with it.

| Class | Size | Tracking | Leading |
| --- | --- | --- | --- |
| `.au-display` | clamp 40→68px | −0.035em | 1.02 |
| `.au-title-1` | clamp 32→48px | −0.028em | 1.07 |
| `.au-title-2` | clamp 24→30px | −0.02em | 1.18 |
| `.au-title-3` | 19px | −0.012em | 1.3 |
| `.au-body-lg` | 17px | −0.003em | 1.62 |
| `.au-body` | 16px | 0 | 1.6 |
| `.au-callout` | 15px | 0 | 1.53 |
| `.au-caption` | 13px | +0.005em | 1.45 |
| `.au-eyebrow` | 11px | +0.145em | uppercase |
| `.au-num` | — | −0.02em | tabular figures |

## Radii and elevation

Radii step ~1.5× each time, so a nested corner can be `(outer − padding)` and
still look right: chip 8, control 11, field 12, card 18, panel 22, hero 28.

Shadows are **warm-tinted** (mixed with the ink, never neutral black) and
**layered** — a tight contact shadow plus a wide ambient one. A single blurred
black shadow is the tell of a system that has not thought about light. Scale:
`shadow-au-1` … `shadow-au-4`, plus `shadow-au-gold`, which is gold-tinted so the
CTA looks like it is emitting rather than only casting.

## Materials

- `.au-glass` — translucent chrome (`backdrop-filter: blur(22px) saturate(180%)`)
  that content scrolls **under**, so the page reads as one surface with glass
  over it rather than a fixed strip stacked on a document.
- `.au-scroll-edge` — a fade where content meets floating chrome, instead of a
  1px rule. A rule says "two regions"; a fade says "one surface, continuing".
- `.au-bloom` — one soft gold radial behind the hero, at very low alpha.
- `.au-rule` — a hairline that fades at both ends, so a divider does not
  terminate in two hard dots.

## Motion

CSS transitions handle hover and colour. Anything a person can **grab** is driven
by the spring in `components/aurum/motion.ts`, because a CSS transition animates
from where it was told to start — interrupt one and the element jumps.

Springs are stated the way Apple states them, as **damping + response**, not
mass/stiffness/damping:

| Interaction | Damping | Response |
| --- | --- | --- |
| Default UI | 1.0 (critically damped, no overshoot) | 0.3–0.4 |
| Momentum / flick | ~0.8 | 0.3–0.4 |

Also provided: `project()` (Apple's exponential-decay flick projection),
`rubberband()` (progressive resistance at a boundary), and `VelocityTracker`
(averages over a ~90ms window — velocity from the last two events alone reads a
one-frame pause before lift-off as a dead stop).

Press feedback is on **pointer-down** at 140ms (`.au-press`), never on release.

### Two decisions worth recording

**The slider does not project momentum.** Projection is right for something you
*throw* — a sheet, a carousel — where the gesture means "send this away". A
slider is the opposite: it is a value you are setting, and it belongs where your
finger stopped. An earlier build did project it, and a quick drag to ~4,500
landed on 5,650 — the control overshooting the number the person had just chosen.
What survives from the gesture is the seam fix: the release velocity is still
handed to the spring, so the handle settles carrying the motion the finger had.

**Pointer sequences are gated on a ref, not React state.** `setDragging(true)` in
`pointerdown` does not take effect until the next commit, but `pointermove` can
fire before it — so a handler checking the state variable reads `false` and
silently drops the start of the drag. The failure is input-speed dependent: fine
when you drag slowly, broken on a quick flick, and invisible to a test that only
presses arrow keys.

## Accessibility

Four independent signals, each with its own answer:

- `prefers-reduced-motion` — travel is removed, colour and opacity feedback kept.
  Reduced motion means a non-vestibular equivalent, not no feedback.
- `prefers-reduced-transparency` — glass becomes solid but stays a distinct plane.
- `prefers-contrast: more` — stronger hairlines, and gold text drops to the deep
  tone everywhere.
- `forced-colors` — the CTA gains a real border so it survives as a button shape.

Plus: focus is a **cool slate** ring (`--au-focus`), never gold — a gold ring on a
gold button is invisible. `@media print` clears the scroll-reveal hidden state,
so an un-scrolled section cannot print blank.

## The funnel

`/book-a-call`. One conversion action runs the whole page — every button goes to
`#book`, and the nav plus a mobile bottom bar keep it reachable from any scroll
position.

| Block | Job |
| --- | --- |
| Hero | One promise, one action, and a live demo rather than a claim |
| Proof bar | Four numbers, answering scepticism before the pitch |
| The gap | The stakes, quantified — makes doing nothing cost something |
| Your numbers | The qualifying step (see below) |
| How it works | Mechanism, only once they want the outcome |
| Proof | Social proof at peak desire |
| The call | Friction removal: what happens, and what does not |
| Book | The form — time first, details second |
| FAQ | The objections that survive everything above |
| Final band | One last ask for whoever read to the bottom |

**Why the calculator is a funnel step, not a toy.** A visitor who moves three
sliders has spent thirty seconds thinking about their own revenue gap, and
arrives at the form persuaded by a number they built rather than one we asserted.
The estimate travels through React context into the booking form, so the call
opens on their figures. Every assumption is printed under the result — a
calculator that hides its multipliers reads as a slot machine.

**Why the form asks for the time first.** Picking a slot costs nothing and
commits something, and a visitor who has claimed 10:30 on Thursday finishes the
form. Opening with name/email/phone asks for payment before showing the product.
Validation fires on blur, never held to submit: telling someone about four
mistakes at once, after they thought they were done, is the most reliable way to
lose them at the last step.

## Integration seam

`submit()` in `components/funnel/booking.tsx` currently resolves locally and
renders the confirmed state — **nothing is persisted**. The marked seam is where
a Cal.com / Calendly call or a Supabase `bookings` insert belongs. The estimate
is already assembled to ride along with it.
