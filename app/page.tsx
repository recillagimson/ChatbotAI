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
import { cn } from "@/lib/utils";

/**
 * speedsettr.com - the front page.
 *
 * The hero is deliberately unchanged from the version that was already live:
 * same promise, same headline, and the same animated DM demo (<DmPhone />),
 * which is the one thing on this page that shows the product working rather
 * than describing it. Everything under it is new.
 *
 * The stat row that used to sit inside the hero's left column now runs as a
 * full-width strip beneath it - same numbers, more room, and it gives the dark
 * canvas a bottom edge to end on.
 */

/** The brand gradient. Pulled from the logo's violet, not invented for the page. */
const BRAND_GRADIENT = "bg-[linear-gradient(120deg,#7c22c4,#5355cb)]";

const PROOF = [
  { value: "24/7", label: "answering, every day of the year" },
  { value: "<30s", label: "typical response time" },
  { value: "100%", label: "written in your voice" },
  { value: "5", label: "channels, one chatbot" },
];

const PILLARS = [
  {
    n: "01",
    kicker: "Instant replies",
    icon: Zap,
    title: "Answers in seconds, in your voice",
    body: "Claude writes the reply, waits a human beat, and groups rapid-fire messages into one answer instead of three. Nobody can tell.",
    points: [
      "Replies day and night, on every channel",
      "Human pacing - no instant-robot tell",
    ],
    mock: <ReplyMock />,
  },
  {
    n: "02",
    kicker: "Trained on you",
    icon: GraduationCap,
    title: "It answers from your business, not from guesses",
    body: "Drop a PDF or type your FAQ. When a lead asks something you never covered, the bot flags it instead of inventing an answer - and shows you the gap.",
    points: ["Never invents pricing or promises", "Correct it once, it remembers"],
    mock: <KnowledgeMock />,
    flip: true,
  },
  {
    n: "03",
    kicker: "You take over",
    icon: Hand,
    title: "The moment it matters, it hands you the chat",
    body: "Asked for a call. Ready to pay. Off-script. The AI steps back, flags the thread, and your inbox tells you exactly who is waiting and for how long.",
    points: ["One inbox for every channel", "Resume the AI when you're done"],
    mock: <TakeoverMock />,
  },
];

const CHANNEL_CHIPS = [
  { label: "IG", className: "bg-ss-ig-bg text-ss-ig-ink" },
  { label: "FB", className: "bg-ss-fb-bg text-ss-fb-ink" },
  { label: "WA", className: "bg-[#e8f8f1] text-[#046c4e]" },
  { label: "TG", className: "bg-[#eef0ff] text-[#4338ca]" },
  { label: "TT", className: "bg-[#f1f2f7] text-ss-navy" },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-bold uppercase leading-none tracking-[0.16em] text-[#7c22c4]">
      {children}
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* ---------------------------------------------------------------- */}
      {/* Dark canvas: nav, hero, proof                                     */}
      {/* ---------------------------------------------------------------- */}
      <div className="grain relative overflow-hidden bg-[radial-gradient(120%_90%_at_8%_0%,#2e2c6d_0%,#221f52_38%,#19163e_78%,#15123a_100%)] text-white">
        <div
          aria-hidden
          className="animate-drift pointer-events-none absolute -top-32 -right-10 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(124,34,196,.34),transparent_68%)]"
        />
        <div
          aria-hidden
          className="animate-drift pointer-events-none absolute -bottom-44 left-44 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(83,85,203,.22),transparent_70%)]"
        />

        <SiteNav />

        {/* Hero - retained */}
        <section className="relative z-10">
          <div className="container py-16 sm:py-20 lg:py-[74px]">
            <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,540px)] lg:gap-16">
              <div className="text-center lg:text-left">
                <div className="animate-rise inline-flex items-center gap-2.5 rounded-full border border-white/[0.12] bg-white/[0.07] py-1.5 pl-2 pr-3.5">
                  <span className="flex items-center gap-1.5 rounded-full bg-[#34d399]/[0.18] px-2 py-[3px]">
                    <span className="h-[5px] w-[5px] rounded-full bg-[#34d399]" />
                    <span className="text-[9.5px] font-bold leading-[1.4] text-[#34d399]">
                      LIVE
                    </span>
                  </span>
                  {/* The full channel list wraps to two cramped lines on a
                      phone, so small screens get the short form. */}
                  <span className="text-xs font-medium leading-none text-[#c3c0e4] sm:hidden">
                    IG · FB · WA · TG · TikTok
                  </span>
                  <span className="hidden text-xs font-medium leading-none text-[#c3c0e4] sm:inline">
                    Instagram · Facebook · WhatsApp · Telegram · TikTok
                  </span>
                </div>

                <h1
                  className="animate-rise mt-5 text-pretty font-display text-[44px] font-bold leading-[1.06] tracking-[-0.03em] sm:text-[54px] xl:text-[62px]"
                  style={{ animationDelay: "80ms" }}
                >
                  Never miss a DM.
                  <br />
                  <span className="bg-[linear-gradient(100deg,#c084fc,#8b5cf6_45%,#818cf8)] bg-clip-text text-transparent">
                    Never miss a <em>sale</em>.
                  </span>
                </h1>

                <p
                  className="animate-rise mx-auto mt-5 max-w-[500px] text-pretty text-[16.5px] leading-[1.65] text-[#b6b4dd] lg:mx-0"
                  style={{ animationDelay: "160ms" }}
                >
                  SpeedSettr is your AI teammate that answers Instagram,
                  Facebook, WhatsApp, Telegram &amp; TikTok DMs 24/7, trained on
                  your business, your tone, and your FAQ. Closing leads while you
                  sleep.
                </p>

                <div
                  className="animate-rise mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center lg:justify-start"
                  style={{ animationDelay: "240ms" }}
                >
                  <Link
                    href="/signup"
                    className={`flex items-center justify-center gap-2.5 rounded-[13px] px-6 py-4 text-[15px] font-bold leading-none text-white shadow-[0_18px_36px_-16px_rgba(124,34,196,.95)] transition-transform hover:scale-[1.03] ${BRAND_GRADIENT}`}
                  >
                    Start now for ${PRICING.monthly}/mo
                    <ArrowRight className="h-[19px] w-[19px]" aria-hidden />
                  </Link>
                  <a
                    href="#product"
                    className="flex items-center justify-center gap-2.5 rounded-[13px] border border-white/[0.16] bg-white/[0.06] px-[22px] py-4 text-[15px] font-semibold leading-none text-white transition-colors hover:bg-white/[0.12]"
                  >
                    See how it works
                  </a>
                </div>

                <div
                  className="animate-rise mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-3 lg:justify-start"
                  style={{ animationDelay: "320ms" }}
                >
                  <span className="flex items-center gap-2 rounded-ctl-lg border border-white/10 bg-white/[0.05] px-3.5 py-2">
                    <Sparkles className="h-[15px] w-[15px] text-[#c084fc]" aria-hidden />
                    <span className="text-xs font-semibold leading-none text-[#c3c0e4]">
                      Powered by HighThrive
                    </span>
                  </span>
                  <span className="text-[12.5px] leading-none text-[#8b88b8]">
                    No card to create your account · cancel any time
                  </span>
                </div>
              </div>

              {/* The live demo - the hero visual, unchanged. */}
              <div className="animate-rise" style={{ animationDelay: "400ms" }}>
                <DmPhone />
              </div>
            </div>
          </div>
        </section>

        {/* Proof strip - the hero's stat row, given the full width */}
        <div className="relative z-10 border-t border-white/[0.08]">
          <div className="container">
            <dl className="grid grid-cols-2 lg:grid-cols-4">
              {PROOF.map(({ value, label }, i) => (
                <div
                  key={label}
                  className={cn(
                    // A <dl> may only contain dt/dd (or divs wrapping them), and
                    // dt must precede its dd - so the pair is authored in that
                    // order and reversed visually, putting the number on top.
                    "flex flex-col-reverse border-white/[0.08] py-7",
                    // Two columns: a rule down the middle, one across the gap.
                    i % 2 === 1 && "border-l pl-6",
                    i >= 2 && "border-t",
                    // Four columns: rules between every cell, none above.
                    "lg:border-l lg:border-t-0 lg:px-8",
                    i === 0 && "lg:border-l-0 lg:pl-0",
                    i === 3 && "lg:pr-0"
                  )}
                >
                  <dt className="mt-2.5 text-[12.5px] font-medium leading-[1.4] text-[#8b88b8]">
                    {label}
                  </dt>
                  <dd className="font-display text-[30px] font-bold leading-none tabular-nums text-white sm:text-[34px]">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Product                                                           */}
      {/* ---------------------------------------------------------------- */}
      <section id="product" className="scroll-mt-4 bg-white">
        <div className="container pb-5 pt-20 sm:pt-[88px]">
          <div className="max-w-[640px]">
            <Eyebrow>The product</Eyebrow>
            <h2 className="mt-4 text-pretty font-display text-[30px] font-bold leading-[1.15] tracking-[-0.025em] text-ss-navy sm:text-[38px] lg:text-[42px]">
              It reads the DM, answers it, and knows when to get out of the way.
            </h2>
          </div>
        </div>

        <div className="container flex flex-col gap-14 pb-[76px] pt-10 sm:gap-[52px]">
          {PILLARS.map(({ n, kicker, icon: Icon, title, body, points, mock, flip }) => (
            <div
              key={n}
              className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16"
            >
              <div className={`max-w-[420px] ${flip ? "lg:order-2" : ""}`}>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-[#f4ebff] px-2.5 py-1.5 text-[10.5px] font-bold uppercase leading-[1.5] tracking-wide text-[#6b21a8]">
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {n} · {kicker}
                </div>
                <h3 className="mt-4 font-display text-[24px] font-bold leading-[1.2] tracking-[-0.02em] text-ss-navy sm:text-[29px]">
                  {title}
                </h3>
                <p className="mt-3.5 text-pretty text-[15px] leading-[1.7] text-[#5c5f80]">
                  {body}
                </p>
                <ul className="mt-5 flex flex-col gap-3">
                  {points.map((p) => (
                    <li
                      key={p}
                      className="flex gap-2.5 text-sm leading-[1.5] text-ss-navy"
                    >
                      <CheckCircle2
                        className="h-[18px] w-[18px] shrink-0 text-[#7c22c4]"
                        aria-hidden
                      />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
              <div className={flip ? "lg:order-1" : ""}>{mock}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Setup                                                             */}
      {/* ---------------------------------------------------------------- */}
      <section
        id="how-it-works"
        className="scroll-mt-4 border-y border-[#efedfa] bg-[#faf9ff]"
      >
        <div className="container py-[76px]">
          <div className="flex flex-wrap items-end gap-6">
            <div className="max-w-[520px]">
              <Eyebrow>Setup</Eyebrow>
              <h2 className="mt-3.5 text-pretty font-display text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-ss-navy sm:text-[38px]">
                Live on your DMs in about ten minutes
              </h2>
            </div>
            <div className="flex items-center gap-2.5 rounded-chip border border-[#e4e0f7] bg-white px-4 py-3 sm:ml-auto">
              <Timer className="h-[18px] w-[18px] text-[#7c22c4]" aria-hidden />
              <span className="text-[13px] font-semibold leading-none text-ss-navy">
                ≈10 min total · no developer
              </span>
            </div>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-3">
            <div className="rounded-card-lg border border-[#ece9f9] bg-white p-6">
              <div className="flex items-center gap-2.5">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-ctl-lg font-display text-[13px] font-bold text-white ${BRAND_GRADIENT}`}
                >
                  1
                </span>
                <span className="text-[11px] font-semibold leading-none text-[#8b8ea8]">
                  3 minutes
                </span>
              </div>
              <div className="mt-4 font-display text-[17px] font-bold leading-[1.25] text-ss-navy">
                Connect your channels
              </div>
              <p className="mt-2.5 text-[13.5px] leading-[1.6] text-[#5c5f80]">
                Paste one ManyChat key and Instagram, Facebook, WhatsApp,
                Telegram and TikTok all come through.
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

            <div className="rounded-card-lg border border-[#ece9f9] bg-white p-6">
              <div className="flex items-center gap-2.5">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-ctl-lg font-display text-[13px] font-bold text-white ${BRAND_GRADIENT}`}
                >
                  2
                </span>
                <span className="text-[11px] font-semibold leading-none text-[#8b8ea8]">
                  5 minutes
                </span>
              </div>
              <div className="mt-4 font-display text-[17px] font-bold leading-[1.25] text-ss-navy">
                Teach it your business
              </div>
              <p className="mt-2.5 text-[13.5px] leading-[1.6] text-[#5c5f80]">
                Upload your FAQ, pricing and policies, then pick a tone. Casual,
                professional, or exactly how you write.
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                <span className="rounded-lg border border-[#ece9f9] px-2.5 py-1.5 text-[11px] font-semibold leading-none text-[#5c5f80]">
                  Casual
                </span>
                <span className="rounded-lg bg-[#f4ebff] px-2.5 py-1.5 text-[11px] font-bold leading-none text-[#6b21a8]">
                  Professional
                </span>
                <span className="rounded-lg border border-[#ece9f9] px-2.5 py-1.5 text-[11px] font-semibold leading-none text-[#5c5f80]">
                  Custom
                </span>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-card-lg bg-ss-navy p-6">
              <div
                aria-hidden
                className="absolute -top-10 right-6 h-[180px] w-1.5 rotate-[24deg] bg-[#7c22c4]/40"
              />
              <div className="relative flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-ctl-lg bg-[#34d399] font-display text-[13px] font-bold text-[#053f2e]">
                  3
                </span>
                <span className="text-[11px] font-semibold leading-none text-[#9c9dcb]">
                  instant
                </span>
              </div>
              <div className="relative mt-4 font-display text-[17px] font-bold leading-[1.25] text-white">
                Go live
              </div>
              <p className="relative mt-2.5 text-[13.5px] leading-[1.6] text-[#b6b4dd]">
                Flip the switch and the next DM gets answered. Watch the first
                few from your inbox, then stop watching.
              </p>
              <div className="relative mt-4 flex items-center gap-2.5 rounded-ctl-lg border border-[#34d399]/30 bg-[#34d399]/[0.14] px-3.5 py-2.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#34d399]" />
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
      <section id="faq" className="scroll-mt-4 bg-white">
        <div className="container py-[76px]">
          <div className="flex flex-col gap-10 lg:flex-row lg:gap-14">
            <div className="lg:w-[340px] lg:shrink-0">
              <Eyebrow>Straight answers</Eyebrow>
              <h2 className="mt-3.5 text-pretty font-display text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-ss-navy sm:text-[34px]">
                The things people actually ask before buying
              </h2>
              <p className="mt-3.5 text-sm leading-[1.65] text-[#8b8ea8]">
                Still unsure? Call the team - a real person picks up.
              </p>
              <a
                href={`tel:${COMPANY.phones[0].tel}`}
                className="mt-4 inline-flex items-center gap-2 rounded-ctl-lg border border-[#e4e0f7] px-4 py-3 text-[13px] font-semibold leading-none text-ss-navy transition-colors hover:bg-[#faf9ff]"
              >
                <Phone className="h-[17px] w-[17px] text-[#7c22c4]" aria-hidden />
                {COMPANY.phones[0].display}
              </a>
            </div>

            <Faq />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Testimonial                                                       */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden bg-ss-navy">
        <div
          aria-hidden
          className="absolute -top-20 right-24 hidden h-[360px] w-2 rotate-[24deg] bg-[#7c22c4]/[0.34] lg:block"
        />
        <div className="container relative py-16">
          <figure className="flex max-w-[1000px] flex-col gap-8 sm:flex-row sm:items-center sm:gap-11">
            <span
              className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full font-display text-[22px] font-bold text-white ${BRAND_GRADIENT}`}
              aria-hidden
            >
              F
            </span>
            <div>
              <blockquote className="text-pretty text-lg leading-[1.55] text-white sm:text-[22px]">
                &ldquo;We stopped losing leads overnight. It replies before
                I&apos;ve even seen the notification - and the ones that matter
                are sitting in my inbox flagged when I wake up.&rdquo;
              </blockquote>
              <figcaption className="mt-4 flex flex-wrap items-center gap-x-2 text-[13.5px] leading-none">
                <span className="font-semibold text-white">
                  Franco Salvacion
                </span>
                <span className="text-[#8b88b8]">· Founder, HighThrive</span>
              </figcaption>
            </div>
          </figure>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Pricing                                                           */}
      {/* ---------------------------------------------------------------- */}
      <section id="pricing" className="scroll-mt-4 bg-white">
        <div className="container py-20">
          <div className="mx-auto max-w-[560px] text-center">
            <Eyebrow>Pricing</Eyebrow>
            <h2 className="mt-3.5 font-display text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-ss-navy sm:text-[38px]">
              One plan. Everything included.
            </h2>
            <p className="mt-3 text-[15px] leading-[1.6] text-[#8b8ea8]">
              No tiers, no per-message billing, no add-ons.
            </p>
          </div>
          <div className="mt-[26px]">
            <PricingPlans />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Closing CTA                                                       */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden bg-[radial-gradient(120%_120%_at_20%_0%,#2e2c6d,#19163e_70%)]">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 right-20 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(124,34,196,.3),transparent_70%)]"
        />
        <div className="container relative py-[84px]">
          <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:gap-11">
            <div className="max-w-[560px]">
              <h2 className="text-pretty font-display text-[30px] font-bold leading-[1.15] tracking-[-0.025em] text-white sm:text-[42px]">
                Your next customer is already in your DMs.
              </h2>
              <p className="mt-4 text-base leading-[1.65] text-[#b6b4dd]">
                Let SpeedSettr answer them in seconds - day or night, in your
                voice.
              </p>
            </div>
            <div className="flex flex-col gap-3 lg:ml-auto lg:min-w-[260px]">
              <Link
                href="/signup"
                className="flex items-center justify-center gap-2.5 rounded-[13px] bg-white px-6 py-[17px] text-[15px] font-bold leading-none text-ss-navy transition-transform hover:scale-[1.03]"
              >
                Get started
                <ArrowRight className="h-[19px] w-[19px]" aria-hidden />
              </Link>
              <a
                href={`tel:${COMPANY.phones[0].tel}`}
                className="flex items-center justify-center gap-2.5 rounded-[13px] border border-white/20 px-6 py-[17px] text-[15px] font-semibold leading-none text-white transition-colors hover:bg-white/10"
              >
                <Phone className="h-[19px] w-[19px]" aria-hidden />
                Talk to a human first
              </a>
            </div>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
