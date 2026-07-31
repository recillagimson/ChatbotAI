import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  Hand,
  Phone,
  Sparkles,
  Timer,
  Zap,
} from "lucide-react";
import { SiteNav } from "@/components/landing/site-nav";
import { ScrollBeam } from "@/components/landing/scroll-beam";
import { ScrollMotion } from "@/components/landing/scroll-motion";
import { DmPhone } from "@/components/landing/dm-phone";
import { PricingPlans } from "@/components/landing/pricing-plans";
import { Faq } from "@/components/landing/faq";
import { LandingFooter } from "@/components/landing/landing-footer";
import {
  KnowledgeMock,
  ReplyMock,
  TakeoverMock,
} from "@/components/landing/product-mocks";
import { COMPANY } from "@/lib/company";
import { PRICING } from "@/lib/pricing";

/**
 * speedsettr.com - the front page, option B: one dark canvas end to end, with
 * every block a bordered card, matching the theme of the new sign-in/sign-up.
 *
 * The hero keeps the animated DM demo (<DmPhone />) - the one thing on this
 * page that shows the product working rather than describing it.
 */

/** The brand gradient. Pulled from the logo's violet, not invented for the page. */
const BRAND_GRADIENT = "bg-[linear-gradient(120deg,#7c22c4,#5355cb)]";

/** `count` opts the figure into the scroll tick-up (see <ScrollMotion />). */
const PROOF = [
  { value: "24/7", label: "answering, every day of the year", count: false },
  { value: "<30s", label: "typical response time", count: true },
  { value: "100%", label: "written in your voice", count: true },
  { value: "5", label: "channels, one chatbot", count: true },
];

const PILLARS = [
  {
    n: "01",
    kicker: "Instant replies",
    icon: Zap,
    title: "Answers in seconds, in your voice",
    body: "The AI writes the reply, waits a human beat, and groups rapid-fire messages into one answer instead of three.",
    mock: <ReplyMock />,
    points: ["Every channel, day and night", "Human pacing, no robot tell"],
  },
  {
    n: "02",
    kicker: "Trained on you",
    icon: GraduationCap,
    title: "Answers from your business, not from guesses",
    body: "Drop a PDF or type your FAQ. Asked something you never covered, it flags the gap instead of inventing an answer.",
    mock: <KnowledgeMock />,
    points: ["Never invents pricing or promises", "Correct it once, it remembers"],
  },
  {
    n: "03",
    kicker: "You take over",
    icon: Hand,
    title: "The moment it matters, it hands you the chat",
    body: "Asked for a call. Ready to pay. Off-script. The AI steps back and your inbox says who is waiting, and for how long.",
    mock: <TakeoverMock />,
    points: ["One inbox for every channel", "Resume the AI when you're done"],
  },
];

const CHANNEL_CHIPS = [
  { label: "IG", className: "bg-[#be185d]/[0.22] text-[#f9a8d4]" },
  { label: "FB", className: "bg-[#1d4ed8]/[0.24] text-[#93c5fd]" },
  { label: "WA", className: "bg-[#059669]/[0.22] text-[#6ee7b7]" },
  { label: "TG", className: "bg-[#6366f1]/[0.24] text-[#a5b4fc]" },
  { label: "TT", className: "bg-white/[0.09] text-white" },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-bold uppercase leading-none tracking-[0.16em] text-[#c084fc]">
      {children}
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="grain relative min-h-screen bg-[#15123a] text-white">
      {/* Keyboard users land on the nav first; this lets them jump the whole
          header in one tab. Visible only while focused. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-ctl-lg focus:bg-white focus:px-4 focus:py-2.5 focus:text-sm focus:font-bold focus:text-ss-navy"
      >
        Skip to content
      </a>

      <ScrollBeam />
      <ScrollMotion />

      {/* The hero wash is an absolute backdrop rather than a wrapper, so the
          nav and <main> can be siblings and the page gets exactly one main
          landmark. Its last colour stop is the page ground, so the bottom edge
          is invisible. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[820px] overflow-hidden bg-[radial-gradient(110%_80%_at_12%_0%,#2e2c6d_0%,#221f52_42%,#19163e_82%,#15123a_100%)]"
      >
        {/* Parallax lives on the wrapper, the ambient drift on the orb inside
            it. Both animate `transform`, and a CSS animation beats an inline
            style, so on one element the drift would simply eat the parallax. */}
        <div data-par="0.22" className="absolute -top-36 -right-16 will-change-transform">
          <div className="animate-drift h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle,rgba(124,34,196,.3),transparent_68%)]" />
        </div>
        <div data-par="-0.14" className="absolute -bottom-24 left-36 will-change-transform">
          <div className="animate-drift h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle,rgba(83,85,203,.2),transparent_70%)]" />
        </div>
      </div>

      {/* SiteNav is a direct child on purpose. It is `sticky top-0`, and a
          sticky element can only travel inside its containing block - wrapped
          in a div the height of the bar itself, it had nowhere to go and
          scrolled away like a static header. Its own z-30 keeps it above the
          hero backdrop, which is what the wrapper used to do. */}
      <SiteNav />

      <main id="main" className="relative scroll-mt-4">
        {/* -------------------------------------------------------------- */}
        {/* Hero                                                            */}
        {/* -------------------------------------------------------------- */}
        <section className="relative z-10">
          <div className="container py-16 sm:py-[70px]">
            <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:gap-14">
              <div className="max-w-[580px] text-center lg:text-left">
                <div className="animate-rise inline-flex items-center gap-2.5 rounded-full border border-white/[0.11] bg-white/[0.05] py-1.5 pl-2 pr-3.5">
                  <span className="flex items-center gap-1.5 rounded-full bg-[#34d399]/[0.16] px-2 py-[3px]">
                    <span className="animate-blink h-[5px] w-[5px] rounded-full bg-[#34d399]" />
                    <span className="text-[9.5px] font-bold leading-[1.4] text-[#34d399]">
                      LIVE
                    </span>
                  </span>
                  {/* The full channel list wraps to two cramped lines on a
                      phone, so small screens get the short form. */}
                  <span className="text-xs font-medium leading-none text-[#b6b4dd] sm:hidden">
                    IG · FB · WA · TG · TikTok
                  </span>
                  <span className="hidden text-xs font-medium leading-none text-[#b6b4dd] sm:inline">
                    Instagram · Facebook · WhatsApp · Telegram · TikTok
                  </span>
                </div>

                <h1
                  className="animate-rise mt-5 text-pretty font-display text-[44px] font-bold leading-[1.06] tracking-[-0.03em] sm:text-[54px] xl:text-[60px]"
                  style={{ animationDelay: "80ms" }}
                >
                  Never miss a DM.
                  <br />
                  <span className="bg-[linear-gradient(100deg,#c084fc,#8b5cf6_45%,#818cf8)] bg-clip-text text-transparent">
                    Never miss a <em>sale</em>.
                  </span>
                </h1>

                <p
                  className="animate-rise mx-auto mt-5 max-w-[480px] text-pretty text-base leading-[1.65] text-[#b6b4dd] lg:mx-0"
                  style={{ animationDelay: "160ms" }}
                >
                  Your AI teammate answers every DM in seconds, trained on your
                  business, your tone, your FAQ. It qualifies the lead, sends the
                  link, and hands you the ones worth a human.
                </p>

                <div
                  className="animate-rise mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center lg:justify-start"
                  style={{ animationDelay: "240ms" }}
                >
                  <Link
                    href="/signup"
                    className={`flex items-center justify-center gap-2.5 rounded-[13px] px-6 py-4 text-[15px] font-bold leading-none text-white shadow-[0_18px_36px_-16px_rgba(124,34,196,.95)] transition-[transform,box-shadow,filter] duration-[340ms] ease-[cubic-bezier(.22,.7,.2,1)] hover:shadow-[0_26px_46px_-14px_rgba(124,34,196,1)] hover:brightness-110 motion-safe:hover:-translate-y-[3px] ${BRAND_GRADIENT}`}
                  >
                    Start now for ${PRICING.monthly}/mo
                    <ArrowRight className="h-[19px] w-[19px]" aria-hidden />
                  </Link>
                  <a
                    href="#product"
                    className="flex items-center justify-center gap-2.5 rounded-[13px] border border-white/[0.14] bg-white/[0.05] px-[22px] py-4 text-[15px] font-semibold leading-none text-white transition-[transform,background-color,border-color] duration-[340ms] ease-[cubic-bezier(.22,.7,.2,1)] hover:border-[#c084fc]/50 hover:bg-white/[0.11] motion-safe:hover:-translate-y-[3px]"
                  >
                    See how it works
                  </a>
                </div>

                <div
                  className="animate-rise mt-6 flex flex-wrap items-center justify-center gap-x-3.5 gap-y-3 lg:justify-start"
                  style={{ animationDelay: "320ms" }}
                >
                  <span className="flex items-center gap-2 rounded-ctl-lg border border-white/10 bg-white/[0.05] px-3.5 py-2">
                    <Sparkles className="h-[15px] w-[15px] text-[#c084fc]" aria-hidden />
                    <span className="text-xs font-semibold leading-none text-[#b6b4dd]">
                      Powered by HighThrive
                    </span>
                  </span>
                  <span className="text-[12.5px] leading-none text-[#8b88b8]">
                    No card to create your account · cancel any time
                  </span>
                </div>
              </div>

              {/* The live demo - the hero visual, unchanged. */}
              <div
                className="animate-rise transition-transform duration-[340ms] ease-[cubic-bezier(.22,.7,.2,1)] motion-safe:hover:-translate-y-2.5 motion-safe:hover:-rotate-[1.2deg]"
                style={{ animationDelay: "400ms" }}
              >
                <DmPhone />
              </div>
            </div>
          </div>
        </section>

      {/* ---------------------------------------------------------------- */}
      {/* Proof                                                             */}
      {/* ---------------------------------------------------------------- */}
      <div className="container pb-16">
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {PROOF.map(({ value, label, count }) => (
            <div
              key={label}
              data-reveal
              className="flex flex-col-reverse rounded-card-lg border border-white/[0.09] bg-[#120f30] p-[22px] transition-[transform,border-color,background-color] duration-[340ms] ease-[cubic-bezier(.22,.7,.2,1)] hover:border-[#c084fc]/[0.42] hover:bg-[#171339] motion-safe:hover:-translate-y-1"
            >
              <dt className="mt-2.5 text-xs font-medium leading-[1.4] text-[#8b88b8]">
                {label}
              </dt>
              {/* `data-count` opts a figure into the tick-up. "24/7" is left off
                  deliberately - it holds two numbers, so counting the first one
                  would animate the 24 and leave "/7" sitting there. */}
              <dd
                {...(count ? { "data-count": value } : {})}
                className="font-display text-[32px] font-bold leading-none tabular-nums text-white"
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Product                                                           */}
      {/* ---------------------------------------------------------------- */}
      <section id="product" className="scroll-mt-4">
        <div className="container pb-[76px]">
          <div className="max-w-[620px]">
            <Eyebrow>The product</Eyebrow>
            <h2 className="mt-4 text-pretty font-display text-[30px] font-bold leading-[1.15] tracking-[-0.025em] text-white sm:text-[36px] lg:text-[40px]">
              It reads the DM, answers it, and knows when to get out of the way.
            </h2>
          </div>

          <div className="mt-9 grid gap-[18px] lg:grid-cols-3">
            {PILLARS.map(({ n, kicker, icon: Icon, title, body, mock, points }) => (
              <div
                key={n}
                data-reveal
                /* min-w-0: a grid item defaults to `min-width: auto`, so the
                   card's min-content (the widest queue row) would otherwise
                   push the whole container past the viewport at 320px.

                   `pillar` drives the hover reveal - see the rule in
                   globals.css. The lift is motion-safe: only the border and
                   shadow change for someone who asked for reduced motion. */
                className="pillar group flex min-w-0 flex-col rounded-[20px] border border-white/[0.09] bg-[#120f30] p-5 transition-[transform,border-color,box-shadow] duration-[340ms] ease-[cubic-bezier(.22,.7,.2,1)] hover:border-[#c084fc]/[0.34] hover:shadow-[0_30px_60px_-30px_rgba(124,34,196,.75)] motion-safe:hover:-translate-y-1.5 sm:p-[26px]"
              >
                <div className="inline-flex items-center gap-1.5 self-start rounded-full border border-[#c084fc]/[0.24] bg-[#7c22c4]/[0.18] px-2.5 py-1.5 text-[10px] font-bold uppercase leading-[1.5] tracking-wide text-[#c084fc]">
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {n} · {kicker}
                </div>
                <h3 className="mt-4 font-display text-[21px] font-bold leading-[1.25] tracking-[-0.01em] text-white">
                  {title}
                </h3>
                <p className="mt-2.5 text-pretty text-[13.5px] leading-[1.6] text-[#8b88b8]">
                  {body}
                </p>

                {mock}

                <ul className="pillar-points mt-auto flex flex-col gap-2.5 pt-[18px]">
                  {points.map((p) => (
                    <li
                      key={p}
                      className="flex gap-2.5 text-[12.5px] leading-[1.45] text-[#b6b4dd]"
                    >
                      <CheckCircle2
                        className="h-4 w-4 shrink-0 text-[#34d399]"
                        aria-hidden
                      />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Setup                                                             */}
      {/* ---------------------------------------------------------------- */}
      <section
        id="how-it-works"
        className="scroll-mt-4 border-y border-white/[0.07] bg-[#120f30]"
      >
        <div className="container py-[70px]">
          <div className="flex flex-wrap items-end gap-6">
            <div className="max-w-[520px]">
              <Eyebrow>Setup</Eyebrow>
              <h2 className="mt-3.5 text-pretty font-display text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-white sm:text-[36px]">
                Live on your DMs in about ten minutes
              </h2>
            </div>
            <div className="flex items-center gap-2.5 rounded-chip border border-white/[0.12] bg-white/[0.05] px-4 py-3 sm:ml-auto">
              <Timer className="h-[18px] w-[18px] text-[#c084fc]" aria-hidden />
              <span className="text-[13px] font-semibold leading-none text-white">
                ≈10 min total · no developer
              </span>
            </div>
          </div>

          <div className="mt-8 grid gap-[18px] md:grid-cols-3">
            <div
              data-reveal
              className="rounded-card-lg border border-white/[0.09] bg-white/[0.04] p-6 transition-[transform,background-color,border-color] duration-[340ms] ease-[cubic-bezier(.22,.7,.2,1)] hover:border-[#c084fc]/[0.38] hover:bg-white/[0.07] motion-safe:hover:-translate-y-[5px]"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-ctl-lg font-display text-[13px] font-bold text-white ${BRAND_GRADIENT}`}
                >
                  1
                </span>
                <span className="text-[11px] font-semibold leading-none text-[#8b88b8]">
                  3 minutes
                </span>
              </div>
              <div className="mt-4 font-display text-[17px] font-bold leading-[1.25] text-white">
                Connect your channels
              </div>
              <p className="mt-2.5 text-[13px] leading-[1.6] text-[#8b88b8]">
                One ManyChat account covers all five. Paste your key, then wire
                one automation per channel you use.
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {CHANNEL_CHIPS.map(({ label, className }) => (
                  <span
                    key={label}
                    className={`rounded-[7px] px-2.5 py-1 text-[10px] font-bold leading-[1.5] ${className}`}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <div
              data-reveal
              className="rounded-card-lg border border-white/[0.09] bg-white/[0.04] p-6 transition-[transform,background-color,border-color] duration-[340ms] ease-[cubic-bezier(.22,.7,.2,1)] hover:border-[#c084fc]/[0.38] hover:bg-white/[0.07] motion-safe:hover:-translate-y-[5px]"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-ctl-lg font-display text-[13px] font-bold text-white ${BRAND_GRADIENT}`}
                >
                  2
                </span>
                <span className="text-[11px] font-semibold leading-none text-[#8b88b8]">
                  5 minutes
                </span>
              </div>
              <div className="mt-4 font-display text-[17px] font-bold leading-[1.25] text-white">
                Teach it your business
              </div>
              <p className="mt-2.5 text-[13px] leading-[1.6] text-[#8b88b8]">
                Upload your FAQ, pricing and policies, then pick a tone.
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                <span className="rounded-lg border border-white/[0.12] px-2.5 py-1.5 text-[11px] font-semibold leading-none text-[#8b88b8]">
                  Casual
                </span>
                <span className="rounded-lg bg-[#7c22c4]/[0.22] px-2.5 py-1.5 text-[11px] font-bold leading-none text-[#c084fc]">
                  Professional
                </span>
                <span className="rounded-lg border border-white/[0.12] px-2.5 py-1.5 text-[11px] font-semibold leading-none text-[#8b88b8]">
                  Custom
                </span>
              </div>
            </div>

            <div
              data-reveal
              className="rounded-card-lg border border-[#c084fc]/[0.26] bg-[linear-gradient(140deg,rgba(124,34,196,.24),rgba(83,85,203,.16))] p-6 transition-[transform,border-color] duration-[340ms] ease-[cubic-bezier(.22,.7,.2,1)] hover:border-[#c084fc]/[0.5] motion-safe:hover:-translate-y-[5px]"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-ctl-lg bg-[#34d399] font-display text-[13px] font-bold text-[#053f2e]">
                  3
                </span>
                <span className="text-[11px] font-semibold leading-none text-[#c3c0e4]">
                  instant
                </span>
              </div>
              <div className="mt-4 font-display text-[17px] font-bold leading-[1.25] text-white">
                Go live
              </div>
              <p className="mt-2.5 text-[13px] leading-[1.6] text-[#c3c0e4]">
                Flip the switch and the next DM gets answered. Watch the first
                few, then stop watching.
              </p>
              <div className="mt-4 flex items-center gap-2.5 rounded-ctl-lg border border-[#34d399]/30 bg-[#34d399]/[0.14] px-3.5 py-2.5">
                <span className="animate-blink h-1.5 w-1.5 rounded-full bg-[#34d399]" />
                <span className="text-[11.5px] font-bold leading-none text-[#34d399]">
                  AI replies are live
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Objections                                                        */}
      {/* ---------------------------------------------------------------- */}
      <section id="faq" className="scroll-mt-4">
        <div className="container py-[70px]">
          <div className="flex flex-col gap-10 lg:flex-row lg:gap-14">
            <div className="lg:w-[340px] lg:shrink-0">
              <Eyebrow>Straight answers</Eyebrow>
              <h2 className="mt-3.5 text-pretty font-display text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-white sm:text-[32px]">
                The things people actually ask before buying
              </h2>
              <p className="mt-3.5 text-[13.5px] leading-[1.65] text-[#8b88b8]">
                Still unsure? Call the team, a real person picks up.
              </p>
              <a
                href={`tel:${COMPANY.phones[0].tel}`}
                className="mt-4 inline-flex items-center gap-2 rounded-ctl-lg border border-white/[0.14] bg-white/[0.05] px-4 py-3 text-[13px] font-semibold leading-none text-white transition-colors hover:bg-white/[0.1]"
              >
                <Phone className="h-[17px] w-[17px] text-[#c084fc]" aria-hidden />
                {COMPANY.phones[0].display}
              </a>
            </div>

            <div className="min-w-0 flex-1" data-reveal>
              <Faq />
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Testimonial                                                       */}
      {/* ---------------------------------------------------------------- */}
      <div className="container pb-[70px]">
        <div
          data-reveal
          className="relative overflow-hidden rounded-[22px] border border-white/[0.09] bg-[linear-gradient(130deg,#221f52,#120f30_70%)] px-6 py-8 sm:px-[38px] sm:py-[34px]"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -top-[70px] right-24 hidden h-[320px] w-[7px] rotate-[24deg] bg-[#7c22c4]/[0.34] lg:block"
          />
          <figure className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-9">
            <span
              className={`flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full font-display text-[21px] font-bold text-white ${BRAND_GRADIENT}`}
              aria-hidden
            >
              F
            </span>
            <div>
              <blockquote className="text-pretty text-lg leading-[1.55] text-white sm:text-xl">
                &ldquo;We stopped losing leads overnight. It replies before
                I&apos;ve even seen the notification, and the ones that matter
                are sitting in my inbox flagged when I wake up.&rdquo;
              </blockquote>
              <figcaption className="mt-4 flex flex-wrap items-center gap-x-2 text-[13px] leading-none">
                <span className="font-semibold text-white">Franco Salvacion</span>
                <span className="text-[#8b88b8]">· Founder, HighThrive</span>
              </figcaption>
            </div>
          </figure>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Pricing                                                           */}
      {/* ---------------------------------------------------------------- */}
      <section id="pricing" className="scroll-mt-4">
        <div className="container pb-[76px]">
          <div className="mx-auto max-w-[560px] text-center">
            <Eyebrow>Pricing</Eyebrow>
            <h2 className="mt-3.5 font-display text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-white sm:text-[36px]">
              One plan. Everything included.
            </h2>
            <p className="mt-3 text-[14.5px] leading-[1.6] text-[#8b88b8]">
              No tiers, no per-message billing, no add-ons.
            </p>
          </div>
          <div className="mt-6" data-reveal>
            <PricingPlans />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Closing CTA                                                       */}
      {/* ---------------------------------------------------------------- */}
      <div className="container pb-[76px]">
        <div
          data-reveal
          className="relative overflow-hidden rounded-[24px] border border-[#c084fc]/20 bg-[radial-gradient(120%_130%_at_18%_0%,#3a1565,#1d1b4c_66%)] px-6 py-10 sm:px-11 sm:py-14"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 right-24 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(124,34,196,.34),transparent_70%)]"
          />
          <div className="relative flex flex-col gap-9 lg:flex-row lg:items-center lg:gap-10">
            <div className="max-w-[560px]">
              <h2 className="text-pretty font-display text-[30px] font-bold leading-[1.15] tracking-[-0.025em] text-white sm:text-[40px]">
                Your next customer is already in your DMs.
              </h2>
              <p className="mt-4 text-[15.5px] leading-[1.65] text-[#c3c0e4]">
                Let SpeedSettr answer them in seconds, day or night, in your
                voice.
              </p>
            </div>
            <div className="flex flex-col gap-3 lg:ml-auto lg:min-w-[264px]">
              <Link
                href="/signup"
                className="flex items-center justify-center gap-2.5 rounded-[13px] bg-white px-6 py-[17px] text-[15px] font-bold leading-none text-ss-navy transition-[transform,box-shadow] duration-[340ms] ease-[cubic-bezier(.22,.7,.2,1)] hover:shadow-[0_22px_40px_-16px_rgba(0,0,0,.6)] motion-safe:hover:-translate-y-[3px]"
              >
                Get started
                <ArrowRight className="h-[19px] w-[19px]" aria-hidden />
              </Link>
              <a
                href={`tel:${COMPANY.phones[0].tel}`}
                className="flex items-center justify-center gap-2.5 rounded-[13px] border border-white/[0.24] px-6 py-[17px] text-[15px] font-semibold leading-none text-white transition-[transform,background-color] duration-[340ms] ease-[cubic-bezier(.22,.7,.2,1)] hover:bg-white/[0.12] motion-safe:hover:-translate-y-[3px]"
              >
                <Phone className="h-[19px] w-[19px]" aria-hidden />
                Talk to a human first
              </a>
            </div>
          </div>
        </div>
      </div>
      </main>

      <LandingFooter />
    </div>
  );
}
