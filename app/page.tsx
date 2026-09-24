import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { JetBrains_Mono } from "next/font/google";
import { COMPANY } from "@/lib/company";
import { PricingPlans } from "@/components/landing/pricing-plans";
import { Faq } from "@/components/landing/faq";
import { HomeJsonLd } from "@/components/seo/structured-data";

/**
 * speedsettr.com landing - the "HighThrive.ai" funnel (Claude Design import,
 * 2026-09-21). Dark near-black + gold, book-a-call model.
 *
 * Brand note: the PUBLIC landing wears the HighThrive.ai brand (owner's call),
 * while the app it fronts (login, dashboard, legal pages) stays SpeedSettr and
 * the legal entity stays Speedsettr LLC. metadataBase is still speedsettr.com,
 * so the per-page title/OG below override the SpeedSettr defaults in
 * app/layout.tsx for this route only.
 *
 * CTAs: every "Book a call" button goes to /book-a-call, the standalone booking
 * page (app/book-a-call/page.tsx). The #book section near the bottom still
 * serves visitors who scroll: when NEXT_PUBLIC_BOOKING_URL is a GoHighLevel
 * widget link it embeds the same GHL calendar inline; any other calendar URL
 * opens in a new tab, and with no URL set the button falls back to email. No
 * fake on-page form. Set the env in Vercel.
 */

export const metadata: Metadata = {
  title: "HighThrive.ai | AI that answers your DMs while you sleep",
  description:
    "An AI setter and closer for your DMs, trained on your pricing, policies and the way you write. It replies in seconds on Instagram, Messenger, WhatsApp, TikTok and Telegram, and hands you the conversations worth your time.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "HighThrive.ai | AI that answers your DMs while you sleep",
    description:
      "Trained on your business, it replies within seconds on every channel and books the calls while you sleep.",
    url: "/",
    siteName: "HighThrive.ai",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "HighThrive.ai | AI that answers your DMs while you sleep",
    description:
      "AI that answers your DMs in seconds and books the calls while you sleep.",
  },
};

const BOOKING_URL = process.env.NEXT_PUBLIC_BOOKING_URL?.trim();
const BRAND_EMAIL = "admin@highthrive.ai";
const bookHref = BOOKING_URL || `mailto:${BRAND_EMAIL}?subject=Book%20a%20call`;
const bookExternal = Boolean(BOOKING_URL);
// A GoHighLevel widget link can be embedded inline (its form_embed.js script
// auto-sizes the iframe). Any other calendar URL just opens in a new tab.
const isGhlBooking = Boolean(
  BOOKING_URL && /leadconnectorhq\.com\/widget\/booking\//.test(BOOKING_URL),
);
const bookingWidgetId = BOOKING_URL?.split("/").filter(Boolean).pop();
const phone = COMPANY.phones[0];

const CHANNELS = [
  "Instagram",
  "Facebook Messenger",
  "TikTok",
  "WhatsApp",
  "Telegram",
];

const PILLARS = [
  {
    n: "01",
    title: "Replies that read like you wrote them",
    body: [
      "It waits a beat before answering rather than firing back in half a second, and if three messages arrive in a row it responds to all of them at once, the way a person would.",
      "You pick the tone during setup and adjust it whenever a reply sounds off.",
    ],
  },
  {
    n: "02",
    title: "Nothing it wasn't taught",
    body: [
      "Upload your FAQ, pricing sheet and policies, or just type them in. Answers come from that material and nowhere else.",
      "Anything outside it gets flagged for you instead of improvised, and a correction you make once sticks.",
    ],
  },
  {
    n: "03",
    title: "Handed back when it matters",
    body: [
      "Someone asking for a call, ready to pay, or clearly frustrated is not a job for automation, so the AI stops and tells you who is waiting and how long they have been.",
      "Take the conversation over from the inbox, then hand it back when you are done.",
    ],
  },
];

const STEPS = [
  {
    n: "01",
    title: "Connect your channels",
    body: "One ManyChat account covers Instagram, Messenger, WhatsApp, TikTok and Telegram. Paste the key, then switch on the channels you actually use.",
    time: "3 min",
  },
  {
    n: "02",
    title: "Teach it your business",
    body: "Upload the FAQ and pricing you already have, or paste them in, and choose how formal the replies should sound.",
    time: "5 min",
  },
  {
    n: "03",
    title: "Go live",
    body: "The next DM that arrives gets answered. Read the first handful of transcripts, then stop checking.",
    time: "right away",
  },
];

function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden
      className="block flex-none"
    >
      <g
        stroke="currentColor"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          d="M14 48 L30 26 M30 26 L48 20 M14 48 L22 68 M22 68 L48 20"
          strokeWidth="2"
          opacity="0.6"
        />
        <polyline points="16,76 40,52 54,66 79,31" strokeWidth="9" />
      </g>
      <g fill="currentColor">
        <circle cx="14" cy="48" r="5" />
        <circle cx="30" cy="26" r="4" />
        <circle cx="48" cy="20" r="5.5" />
        <circle cx="22" cy="68" r="3.5" />
        <polygon points="88,18 88,46 60,22" />
      </g>
    </svg>
  );
}

// Declared here, not in app/layout.tsx, because this page and /book-a-call are
// the only two that paint it. next/font preloads one file per family for every
// route under the layout that declares it, so keeping it in the root layout
// cost every signed-in route a 30.6 kB preload it never used. The .variable
// class goes on this page's root wrapper below, which encloses every `mono`
// user, so --font-mono resolves exactly as before.
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500"],
});

const container = "mx-auto max-w-[1120px] px-6";
const primaryCta =
  "inline-flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(145deg,#F2C85C,#C9952A)] font-semibold text-[#141414] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] transition hover:brightness-105";
const mono = "font-[family-name:var(--font-mono)]";

export default function LandingPage() {
  const year = new Date().getFullYear();

  return (
    <div
      className={`${jetbrainsMono.variable} min-h-dvh font-[family-name:var(--font-display)] text-[#F4F1EA] antialiased`}
      style={{
        backgroundColor: "#0A0A0C",
        backgroundImage:
          "radial-gradient(90% 60% at 72% 6%, rgba(232,182,68,0.14) 0%, rgba(232,182,68,0) 58%), linear-gradient(rgba(244,241,234,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(244,241,234,0.035) 1px, transparent 1px)",
        backgroundSize: "auto, 78px 78px, 78px 78px",
      }}
    >
      <HomeJsonLd />

      <a
        href="#main"
        className="sr-only rounded-full bg-[#E8B644] px-4 py-2 text-sm font-bold text-[#141414] focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60]"
      >
        Skip to content
      </a>

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-[#F4F1EA]/[0.08] bg-[rgba(10,10,12,0.72)] backdrop-blur-[20px] backdrop-saturate-[1.8]">
        <nav className={`${container} flex items-center gap-6 py-3.5`}>
          <a
            href="#main"
            className="mr-auto flex items-center gap-2.5 text-[#E8B644] transition-colors hover:text-[#F7D377]"
            aria-label="HighThrive.ai home"
          >
            <BrandMark size={26} />
            <span className="text-lg font-semibold tracking-[-0.025em]">
              HighThrive.ai
            </span>
          </a>
          <div className="hidden flex-wrap gap-x-[22px] text-sm text-[#A9A499] md:flex">
            <a href="#product" className="transition-colors hover:text-[#F4F1EA]">
              Product
            </a>
            <a href="#setup" className="transition-colors hover:text-[#F4F1EA]">
              How it works
            </a>
            <a href="#pricing" className="transition-colors hover:text-[#F4F1EA]">
              Pricing
            </a>
            <a href="#faq" className="transition-colors hover:text-[#F4F1EA]">
              FAQ
            </a>
          </div>
          <Link
            href="/login"
            className="hidden text-sm text-[#A9A499] transition-colors hover:text-[#F4F1EA] sm:inline"
          >
            Sign in
          </Link>
          <Link href="/book-a-call" className={`${primaryCta} px-4 py-2.5 text-sm`}>
            Book a call
          </Link>
        </nav>
      </header>

      <main id="main">
        {/* Hero */}
        <section
          className={`${container} grid grid-cols-1 items-center gap-12 pt-[72px] lg:grid-cols-2`}
        >
          <div>
            <div className="text-[13px] font-light tracking-[0.1em] text-[#D9B262]">
              AI Setter &amp; Closer Chatbot
            </div>
            <h1 className="mt-[18px] text-balance text-[clamp(40px,6.2vw,68px)] font-semibold leading-[1.02] tracking-[-0.035em]">
              Your DMs get answered{" "}
              <span className="text-[#E8B644]">while you sleep.</span>
            </h1>
            <p className="mt-[22px] max-w-[30em] text-pretty text-[18px] leading-[1.55] text-[#A9A499]">
              Trained on your pricing, your policies and the way you actually
              write, it replies within seconds on every channel you use. When
              someone&apos;s ready to buy or asks something it wasn&apos;t taught,
              the conversation lands back with you.
            </p>
            <div className="mt-[30px] flex flex-wrap gap-2.5">
              <Link href="/book-a-call" className={`${primaryCta} px-6 py-3.5 text-[16px]`}>
                Book a 15-min call <span aria-hidden>&rarr;</span>
              </Link>
              <a
                href="#product"
                className="inline-flex items-center gap-2 rounded-full border border-[#F4F1EA]/[0.14] bg-[#F4F1EA]/[0.06] px-[22px] py-3.5 text-[16px] font-medium text-[#F4F1EA] transition-colors hover:bg-[#111216]"
              >
                See how it works
              </a>
            </div>
            <div className="mt-5 text-[13px] text-[#8A8579]">
              15 minutes, no card, and we set it up live on the call.
            </div>
          </div>

          {/* DM mock */}
          <div className="flex justify-center">
            <div className="flex w-full max-w-[360px] flex-col gap-3 rounded-[28px] border border-[#F4F1EA]/10 bg-[#111216] p-4 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.8),0_2px_6px_rgba(0,0,0,0.4)]">
              <div className="flex items-center gap-2.5 border-b border-[#F4F1EA]/[0.08] pb-3">
                <div className="h-[34px] w-[34px] flex-none rounded-full border border-[#F4F1EA]/[0.09] bg-[linear-gradient(140deg,#2A2C33,#1B1C22)]" />
                <div className="leading-[1.25]">
                  <div className="text-sm font-semibold tracking-[-0.01em]">
                    jordanlee.coaching
                  </div>
                  <div className="text-[11px] text-[#8A8579]">
                    Instagram &middot; AI active
                  </div>
                </div>
                <div className={`${mono} ml-auto text-[10px] tracking-[0.08em] text-[#2F9E6B]`}>
                  4s
                </div>
              </div>
              <div className="max-w-[80%] self-start rounded-[16px_16px_16px_5px] bg-[#1B1C22] px-[13px] py-2.5 text-[13.5px] leading-[1.45]">
                how much is your 1:1 coaching?
              </div>
              <div className="max-w-[86%] self-end rounded-[16px_16px_5px_16px] bg-[linear-gradient(145deg,#F2C85C,#C9952A)] px-[13px] py-2.5 text-[13.5px] font-medium leading-[1.45] text-[#141414]">
                1:1 coaching runs in 12-week blocks: weekly calls plus voice-note
                access between them. Jordan keeps a few intro calls open each
                week. Want me to hold one?
              </div>
              <div className="max-w-[86%] self-end rounded-[16px] bg-[#1B1C22] px-[13px] py-2.5 text-[13.5px] leading-[1.45]">
                yes please, tuesday morning if there&apos;s room
              </div>
              <div className="mt-0.5 flex items-center gap-2 rounded-[14px] border border-[#A06E08]/[0.18] bg-[#1E1809] px-3 py-2.5">
                <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#E8B644] text-[11px] text-[#1E1809]">
                  &#10003;
                </span>
                <span className="text-[12.5px] font-medium text-[#E8B644]">
                  Call booked &middot; added to your calendar
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Channel strip */}
        <section className={`${container} pt-16`}>
          <div className="flex flex-wrap items-center gap-x-7 gap-y-3 border-y border-[#F4F1EA]/10 py-5">
            <span className="text-sm text-[#8A8579]">Works on</span>
            {CHANNELS.map((c, i) => (
              <span key={c} className="flex items-center gap-x-7">
                {i > 0 && (
                  <span
                    aria-hidden
                    className="h-[3px] w-[3px] rounded-full bg-[#3A3B42]"
                  />
                )}
                <span className="text-[15px] font-medium tracking-[-0.01em] text-[#A9A499]">
                  {c}
                </span>
              </span>
            ))}
          </div>
        </section>

        {/* Problem + timeline */}
        <section className={`${container} pt-[84px]`}>
          <div className="grid grid-cols-1 items-center gap-11 lg:grid-cols-2">
            <div>
              <h2 className="text-balance text-[clamp(28px,3.6vw,42px)] font-semibold leading-[1.1] tracking-[-0.03em]">
                A lead who waits until morning usually books with someone else.
              </h2>
              <p className="mt-[18px] max-w-[32em] text-pretty text-[16.5px] leading-[1.6] text-[#A9A499]">
                Interest fades fast. Answer inside a few minutes and you&apos;re
                still in a conversation; answer the next day and you&apos;re
                following up on one. Most of the messages worth money arrive when
                nobody is watching the inbox.
              </p>
              <Link
                href="/book-a-call"
                className="mt-[26px] inline-flex items-center gap-2.5 text-[16px] font-semibold text-[#E8B644]"
              >
                See it on your own account <span aria-hidden>&rarr;</span>
              </Link>
            </div>
            <div className="rounded-[18px] border border-[#F4F1EA]/10 bg-[#111216] px-6 py-[22px]">
              <div className="text-[13px] text-[#8A8579]">
                One Tuesday night, one account
              </div>
              <div className="mt-4 grid gap-3.5">
                {[
                  { t: "11:42p", m: "“do you have anything for beginners?”", muted: false },
                  { t: "1:09a", m: "“what’s the price?”", muted: false },
                  { t: "2:31a", m: "“never mind, found someone”", muted: false },
                  { t: "8:15a", m: "you open Instagram", muted: true },
                ].map((row, i) => (
                  <div
                    key={row.t}
                    className={`flex items-baseline gap-[18px] ${
                      i === 3 ? "border-t border-[#F4F1EA]/[0.09] pt-3.5" : ""
                    }`}
                  >
                    <span
                      className={`${mono} min-w-[58px] text-[12.5px] ${
                        row.muted ? "text-[#8A8579]" : "text-[#D9B262]"
                      }`}
                    >
                      {row.t}
                    </span>
                    <span
                      className={`text-[14.5px] leading-[1.5] ${
                        row.muted ? "text-[#8A8579]" : "text-[#A9A499]"
                      }`}
                    >
                      {row.m}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Product */}
        <section id="product" className={`${container} scroll-mt-24 pt-24`}>
          <h2 className="max-w-[18em] text-balance text-[clamp(28px,3.6vw,42px)] font-semibold leading-[1.1] tracking-[-0.03em]">
            It answers what it knows, and hands you what it doesn&apos;t.
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-x-10 md:grid-cols-3">
            {PILLARS.map((p) => (
              <div
                key={p.n}
                className="border-t border-[#F4F1EA]/[0.14] py-[26px]"
              >
                <div className={`${mono} text-[12px] text-[#D9B262]`}>{p.n}</div>
                <div className="mt-3.5 text-[20px] font-semibold leading-[1.25] tracking-[-0.02em]">
                  {p.title}
                </div>
                {p.body.map((b, i) => (
                  <p
                    key={i}
                    className={`text-[15px] leading-[1.6] text-[#A9A499] ${
                      i === 0 ? "mt-2.5" : "mt-3"
                    }`}
                  >
                    {b}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </section>

        {/* Inbox + stats mock */}
        <section className={`${container} pt-[84px]`}>
          <div className="overflow-hidden rounded-[24px] border border-[#F4F1EA]/10 bg-[#111216] shadow-[0_26px_56px_-38px_rgba(0,0,0,0.85)]">
            <div className="flex items-center gap-2.5 border-b border-[#F4F1EA]/[0.09] bg-[#15161B] px-5 py-3.5">
              <span className="h-[9px] w-[9px] rounded-full bg-[#2A2C33]" />
              <span className="h-[9px] w-[9px] rounded-full bg-[#2A2C33]" />
              <span className="h-[9px] w-[9px] rounded-full bg-[#2A2C33]" />
              <span className="ml-2.5 text-[13px] font-medium text-[#A9A499]">
                Inbox
              </span>
              <span className={`${mono} ml-auto text-[10.5px] uppercase tracking-[0.1em] text-[#D9B262]`}>
                3 need you
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2">
              <div className="border-b border-[#F4F1EA]/[0.08] md:border-b-0 md:border-r">
                {[
                  { i: "M", h: "@maya.fitness", tag: "wants a call", tagColor: "text-[#D9B262]", msg: "can we talk friday before I commit?", gold: true },
                  { i: "D", h: "@dlp.studio", tag: "AI handled", tagColor: "text-[#2F9E6B]", msg: "pricing sent · 2:14 AM", gold: false },
                  { i: "R", h: "@ravi.builds", tag: "follow-up queued", tagColor: "text-[#8A8579]", msg: "quiet since Tuesday · nudge in 4h", gold: false },
                ].map((row, idx) => (
                  <div
                    key={row.h}
                    className={`flex gap-3 px-5 py-4 ${
                      idx < 2 ? "border-b border-[#F4F1EA]/[0.08]" : ""
                    } ${row.gold ? "bg-[#1E1809]" : ""}`}
                  >
                    <span
                      className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-[13px] font-semibold ${
                        row.gold
                          ? "bg-[linear-gradient(145deg,#F2C85C,#C9952A)] text-[#141414]"
                          : "bg-[#1B1C22] text-[#A9A499]"
                      }`}
                    >
                      {row.i}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold tracking-[-0.01em]">
                          {row.h}
                        </span>
                        <span className={`${mono} ml-auto text-[10.5px] ${row.tagColor}`}>
                          {row.tag}
                        </span>
                      </div>
                      <div className="mt-[3px] truncate text-[13px] text-[#A9A499]">
                        {row.msg}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-[#111216] px-[26px] py-7">
                <div className={`${mono} text-[10.5px] uppercase tracking-[0.14em] text-[#8A8579]`}>
                  Last 30 days
                </div>
                <div className="mt-[18px] grid grid-cols-3 gap-[18px]">
                  {[
                    { v: "1,842", l: "DMs answered" },
                    { v: "118", l: "calls booked" },
                    { v: "11s", l: "median reply" },
                  ].map((s) => (
                    <div key={s.l}>
                      <div className="text-[28px] font-semibold tracking-[-0.03em] text-[#E8B644]">
                        {s.v}
                      </div>
                      <div className="mt-1 text-[13px] text-[#A9A499]">
                        {s.l}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 border-t border-[#F4F1EA]/[0.09] pt-5 text-[14px] leading-[1.55] text-[#A9A499]">
                  You opened the app{" "}
                  <strong className="font-semibold text-[#F4F1EA]">
                    nine times
                  </strong>{" "}
                  that month, once for each conversation that needed you.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Setup */}
        <section id="setup" className={`${container} scroll-mt-24 pt-24`}>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 basis-[280px]">
              <h2 className="text-[clamp(28px,3.6vw,42px)] font-semibold leading-[1.1] tracking-[-0.03em]">
                Setup takes about ten minutes
              </h2>
            </div>
            <div className="text-sm text-[#8A8579]">
              No developer, and we do it with you on the call.
            </div>
          </div>
          <div className="mt-[30px]">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="flex gap-[18px] border-t border-[#F4F1EA]/[0.11] py-[22px]"
              >
                <span className={`${mono} pt-[3px] text-[13px] text-[#D9B262]`}>
                  {s.n}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[18px] font-semibold tracking-[-0.02em]">
                    {s.title}
                  </div>
                  <p className="mt-2 max-w-[34em] text-[15px] leading-[1.6] text-[#A9A499]">
                    {s.body}
                  </p>
                </div>
                <span className="whitespace-nowrap pt-[5px] text-[13px] text-[#8A8579]">
                  {s.time}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Testimonial */}
        <section className={`${container} pt-24`}>
          <figure className="m-0 max-w-[42em] border-t border-[#F4F1EA]/[0.14] pt-8">
            <blockquote className="text-pretty text-[clamp(19px,2.3vw,25px)] font-normal leading-[1.45] tracking-[-0.015em]">
              &ldquo;The part I didn&apos;t expect was waking up to three booked
              calls instead of thirty unread messages. It replies before
              I&apos;ve seen the notification, and the two that actually needed me
              were sitting at the top flagged.&rdquo;
            </blockquote>
            <figcaption className="mt-5 text-sm text-[#8A8579]">
              Franco Salvacion, founder, HighThrive.ai
            </figcaption>
          </figure>
        </section>

        {/* Comparison */}
        <section className={`${container} pt-24`}>
          <h2 className="max-w-[18em] text-balance text-[clamp(28px,3.6vw,42px)] font-semibold leading-[1.1] tracking-[-0.03em]">
            The other two ways of handling this cost more.
          </h2>
          <div className="mt-9 grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              {
                title: "You answer them",
                figure: "~12 hrs/wk",
                muted: true,
                points: [
                  "Replies land hours late",
                  "Nothing happens while you sleep",
                  "Your best hours go to FAQs",
                ],
              },
              {
                title: "You hire a setter",
                figure: "$3-5k/mo",
                muted: true,
                points: [
                  "Hiring, training, turnover",
                  "One timezone, one shift",
                  "Quality drifts when you stop watching",
                ],
              },
              {
                title: "HighThrive.ai",
                figure: "$897/mo",
                muted: false,
                points: [
                  "Seconds to reply, at any hour",
                  "Five channels in one inbox",
                  "Answers the same at 3am as at noon",
                ],
              },
            ].map((c) => (
              <div
                key={c.title}
                className={`rounded-[20px] p-6 ${
                  c.muted
                    ? "border border-[#F4F1EA]/10 bg-[#F4F1EA]/[0.03]"
                    : "border border-[#A06E08]/[0.45] bg-[#111216]"
                }`}
              >
                <div
                  className={`text-[17px] font-semibold tracking-[-0.02em] ${
                    c.muted ? "text-[#A9A499]" : "text-[#F4F1EA]"
                  }`}
                >
                  {c.title}
                </div>
                <div
                  className={`mt-3.5 text-[28px] font-semibold tracking-[-0.03em] ${
                    c.muted ? "text-[#A9A499]" : "text-[#E8B644]"
                  }`}
                >
                  {c.figure}
                </div>
                <div
                  className={`mt-4 flex flex-col gap-2.5 text-[14px] leading-[1.45] ${
                    c.muted ? "text-[#8A8579]" : "text-[#F4F1EA]"
                  }`}
                >
                  {c.points.map((pt) => (
                    <div key={pt}>{pt}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className={`${container} scroll-mt-24 pt-24`}>
          <h2 className="text-[clamp(28px,3.6vw,42px)] font-semibold leading-[1.1] tracking-[-0.03em]">
            One plan, everything in it
          </h2>
          <p className="mt-3 max-w-[34em] text-[16.5px] leading-[1.6] text-[#A9A499]">
            No tiers to compare, no per-message billing, and nothing priced as an
            add-on later.
          </p>
          <div className="mt-8">
            <PricingPlans />
          </div>
        </section>

        {/* FAQ */}
        <section
          id="faq"
          className={`${container} grid scroll-mt-24 grid-cols-1 items-start gap-10 pt-24 lg:grid-cols-2`}
        >
          <div>
            <h2 className="text-[clamp(26px,3.2vw,38px)] font-semibold leading-[1.12] tracking-[-0.03em]">
              What people ask before booking
            </h2>
            <p className="mt-3.5 text-[15.5px] leading-[1.55] text-[#A9A499]">
              If yours isn&apos;t here, the number below reaches a person.
            </p>
            <a
              href={`tel:${phone.tel}`}
              className="mt-[18px] inline-flex items-center gap-2.5 rounded-full border border-[#F4F1EA]/[0.14] bg-[#F4F1EA]/[0.06] px-[18px] py-2.5 text-[14.5px] font-medium text-[#F4F1EA] transition-colors hover:bg-[#111216]"
            >
              {phone.display}
            </a>
          </div>
          <Faq />
        </section>

        {/* Book */}
        <section id="book" className={`${container} scroll-mt-24 pt-24`}>
          <div className="grid grid-cols-1 overflow-hidden rounded-[28px] border border-[#F4F1EA]/10 bg-[#111216] shadow-[0_34px_70px_-40px_rgba(0,0,0,0.9)] md:grid-cols-2">
            <div className="border-b border-[#F4F1EA]/[0.09] bg-[linear-gradient(170deg,#1E1809_0%,#15161B_60%)] p-10 md:border-b-0 md:border-r">
              <h2 className="text-balance text-[clamp(28px,3.4vw,40px)] font-semibold leading-[1.08] tracking-[-0.03em]">
                Book a call
              </h2>
              <p className="mt-4 max-w-[27em] text-[16px] leading-[1.6] text-[#A9A499]">
                Bring your handle and your pricing. We load your FAQ while you
                watch, point it at your real inbox, and you see it answer an
                actual message before the call ends.
              </p>
              <p className="mt-3.5 max-w-[27em] text-[16px] leading-[1.6] text-[#A9A499]">
                There&apos;s no deck and no card. If your DMs don&apos;t justify
                it we&apos;ll say so.
              </p>
              <div className="mt-7 inline-flex items-center gap-2.5 rounded-full border border-[#A06E08]/20 bg-[#F4F1EA]/[0.06] px-3.5 py-2.5 text-[13px] font-medium text-[#E8B644]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#E8B644]" />3 slots
                left this week
              </div>
            </div>

            <div className="p-9">
              <div className={`${mono} text-[10.5px] uppercase tracking-[0.14em] text-[#8A8579]`}>
                15-minute call
              </div>
              <div className="mt-3 text-[22px] font-semibold tracking-[-0.025em]">
                Grab a time that works
              </div>
              <p className="mt-3 text-[15px] leading-[1.55] text-[#A9A499]">
                Pick a slot on the calendar and we take it from there. No card,
                no obligation, cancel with one click.
              </p>
              {isGhlBooking ? (
                <>
                  <div className="mt-6 overflow-hidden rounded-2xl border border-[#A06E08]/25 bg-white">
                    <iframe
                      src={BOOKING_URL}
                      title="Book a 15-minute call"
                      id={bookingWidgetId}
                      className="block w-full"
                      style={{ minHeight: 700, border: "none" }}
                      scrolling="no"
                    />
                  </div>
                  <Script
                    src="https://link.msgsndr.com/js/form_embed.js"
                    strategy="afterInteractive"
                  />
                </>
              ) : (
                <a
                  href={bookHref}
                  {...(bookExternal
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                  className={`${primaryCta} mt-6 w-full px-6 py-4 text-[16px]`}
                >
                  Book your 15-min call <span aria-hidden>&rarr;</span>
                </a>
              )}
              <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-[#8A8579]">
                <span>Prefer to talk first?</span>
                <a
                  href={`tel:${phone.tel}`}
                  className="text-[#A9A499] transition-colors hover:text-[#F4F1EA]"
                >
                  {phone.display}
                </a>
                <span aria-hidden>&middot;</span>
                <a
                  href={`mailto:${BRAND_EMAIL}`}
                  className="text-[#A9A499] transition-colors hover:text-[#F4F1EA]"
                >
                  {BRAND_EMAIL}
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className={`${container} pt-[72px]`}>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4 rounded-[20px] border border-[#F4F1EA]/[0.11] bg-[#1E1809] px-[26px] py-[22px]">
            <div className="flex-1 basis-[280px]">
              <div className="text-[18px] font-semibold tracking-[-0.02em]">
                Want to see it running on your own account?
              </div>
              <div className="mt-[5px] text-[14.5px] text-[#A9A499]">
                Fifteen minutes with someone who sets these up every day.
              </div>
            </div>
            <Link href="/book-a-call" className={`${primaryCta} px-[22px] py-3.5 text-[15.5px]`}>
              Book a call <span aria-hidden>&rarr;</span>
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="mt-[88px] border-t border-[#F4F1EA]/10 bg-[#F4F1EA]/[0.02]">
        <div className={`${container} grid grid-cols-2 gap-8 py-11 md:grid-cols-4`}>
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 text-[#E8B644]">
              <BrandMark size={24} />
              <span className="text-[17px] font-semibold tracking-[-0.025em]">
                HighThrive.ai
              </span>
            </div>
            <p className="mt-3 max-w-[22em] text-[13.5px] leading-[1.55] text-[#A9A499]">
              Answers the DMs you can&apos;t get to, in the words you&apos;d have
              used.
            </p>
          </div>
          <div className="flex flex-col gap-2.5 text-[13.5px] text-[#A9A499]">
            <div className={`${mono} text-[10.5px] uppercase tracking-[0.14em] text-[#8A8579]`}>
              Product
            </div>
            <a href="#setup" className="transition-colors hover:text-[#F4F1EA]">
              How it works
            </a>
            <a href="#pricing" className="transition-colors hover:text-[#F4F1EA]">
              Pricing
            </a>
            <a href="#faq" className="transition-colors hover:text-[#F4F1EA]">
              FAQ
            </a>
            <Link href="/login" className="transition-colors hover:text-[#F4F1EA]">
              Sign in
            </Link>
          </div>
          <div className="flex flex-col gap-2.5 text-[13.5px] text-[#A9A499]">
            <div className={`${mono} text-[10.5px] uppercase tracking-[0.14em] text-[#8A8579]`}>
              Contact
            </div>
            <a
              href={`mailto:${BRAND_EMAIL}`}
              className="transition-colors hover:text-[#F4F1EA]"
            >
              {BRAND_EMAIL}
            </a>
            <a
              href={`tel:${phone.tel}`}
              className="transition-colors hover:text-[#F4F1EA]"
            >
              {phone.display}
            </a>
            <address className="not-italic">{COMPANY.address}</address>
          </div>
          <div className="flex flex-col gap-2.5 text-[13.5px] text-[#A9A499]">
            <div className={`${mono} text-[10.5px] uppercase tracking-[0.14em] text-[#8A8579]`}>
              Legal
            </div>
            <Link href="/privacy" className="transition-colors hover:text-[#F4F1EA]">
              Privacy policy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-[#F4F1EA]">
              Terms of service
            </Link>
            <Link
              href="/refund-policy"
              className="transition-colors hover:text-[#F4F1EA]"
            >
              Refund policy
            </Link>
          </div>
        </div>
        <div className={`${container} flex flex-wrap justify-between gap-3 pb-10 text-[12.5px] text-[#8A8579]`}>
          <span>&copy; {year} Speedsettr LLC. All rights reserved.</span>
          <span>Encrypted in transit &middot; payments by Stripe</span>
        </div>
      </footer>
    </div>
  );
}
