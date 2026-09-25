import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { JetBrains_Mono } from "next/font/google";
import { COMPANY } from "@/lib/company";
import { HighThriveMark } from "@/components/brand/highthrive-mark";

/**
 * /book-a-call - the standalone booking page every "Book a call" button lands on
 * (landing header, hero, pricing, bottom CTA, and the sign-in screen).
 *
 * The calendar is the GoHighLevel embed exactly as GHL issues it: the widget
 * iframe plus form_embed.js, which listens for the widget's size messages and
 * resizes the iframe to fit, so the calendar scrolls with the page rather than
 * inside a box. Same dark + gold look as the landing.
 */

// The GHL embed as issued for this calendar. Keep it eager and keep form_embed.js
// afterInteractive: form_embed.js hides every booking iframe it has not
// initialized (off-screen at left -9999px) until the widget inside posts its
// one-time handshake, so a loading="lazy" frame would never load and never show,
// and a script deferred past window load can miss the handshake. The id is only
// a label: form_embed.js keeps any id it finds and matches the widget by its
// window, so the landing's differently derived id is fine.
const GHL_BOOKING_SRC =
  "https://api.leadconnectorhq.com/widget/booking/8ny6hFE7IdLDazoS4MCw";
const GHL_IFRAME_ID = "8ny6hFE7IdLDazoS4MCw_1790022979475";
const BRAND_EMAIL = "admin@highthrive.ai";

export const metadata: Metadata = {
  title: "Book a call | HighThrive.ai",
  description:
    "Pick a time for a call. We load your FAQ, point the AI at your real inbox, and you watch it answer an actual DM before the call ends.",
  alternates: { canonical: "/book-a-call" },
  openGraph: {
    title: "Book a call | HighThrive.ai",
    description:
      "We load your FAQ, point the AI at your real inbox, and you watch it answer an actual DM.",
    url: "/book-a-call",
    siteName: "HighThrive.ai",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Book a call | HighThrive.ai",
    description: "Watch the AI answer an actual DM on your own account.",
  },
};

const ON_THE_CALL = [
  "We load your FAQ and pricing while you watch",
  "We point it at your real inbox",
  "You see it answer an actual message before the call ends",
];

// Declared here rather than in app/layout.tsx: this page and the landing are
// the only two that paint it, and a root-layout declaration made every
// signed-in route preload a 30.6 kB family it never uses. The .variable class
// goes on the root wrapper below, which encloses every `mono` user here.
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500"],
});

const container = "mx-auto w-full max-w-[1120px] px-6";
const mono = "font-[family-name:var(--font-mono)]";

export default function BookACallPage() {
  const year = new Date().getFullYear();
  const phone = COMPANY.phones[0];

  return (
    <div
      className={`${jetbrainsMono.variable} flex min-h-dvh flex-col font-[family-name:var(--font-display)] text-[#F4F1EA] antialiased`}
      style={{
        backgroundColor: "#0A0A0C",
        backgroundImage:
          "radial-gradient(90% 60% at 72% 6%, rgba(232,182,68,0.14) 0%, rgba(232,182,68,0) 58%), linear-gradient(rgba(244,241,234,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(244,241,234,0.035) 1px, transparent 1px)",
        backgroundSize: "auto, 78px 78px, 78px 78px",
      }}
    >
      <a
        href="#calendar"
        className="sr-only rounded-full bg-[#E8B644] px-4 py-2 text-sm font-bold text-[#141414] focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60]"
      >
        Skip to the calendar
      </a>

      <header className="border-b border-[#F4F1EA]/[0.08] bg-[rgba(10,10,12,0.72)] backdrop-blur-[20px] backdrop-saturate-[1.8]">
        <nav className={`${container} flex items-center gap-6 py-3.5`}>
          <Link
            href="/"
            className="mr-auto flex items-center gap-2.5 text-[#E8B644] transition-colors hover:text-[#F7D377]"
            aria-label="HighThrive.ai home"
          >
            <HighThriveMark size={26} />
            <span className="text-lg font-semibold tracking-[-0.025em]">
              HighThrive.ai
            </span>
          </Link>
          <Link
            href="/"
            className="text-sm text-[#A9A499] transition-colors hover:text-[#F4F1EA]"
          >
            <span aria-hidden>&larr;</span> Back to site
          </Link>
          <Link
            href="/login"
            className="hidden text-sm text-[#A9A499] transition-colors hover:text-[#F4F1EA] sm:inline"
          >
            Sign in
          </Link>
        </nav>
      </header>

      <main
        className={`${container} grid flex-1 grid-cols-1 gap-10 pb-20 pt-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14 lg:pt-[72px]`}
      >
        {/* What the call is */}
        <section className="lg:sticky lg:top-10 lg:self-start">
          <div
            className={`${mono} text-[10.5px] uppercase tracking-[0.14em] text-[#8A8579]`}
          >
            Live walkthrough
          </div>
          <h1 className="mt-4 text-balance text-[clamp(36px,5vw,52px)] font-semibold leading-[1.04] tracking-[-0.035em]">
            Book a call
          </h1>
          <p className="mt-5 max-w-[30em] text-pretty text-[17px] leading-[1.6] text-[#A9A499]">
            Bring your handle and your pricing. Pick a slot on the calendar and
            we take it from there.
          </p>

          <ul className="mt-7 grid gap-3">
            {ON_THE_CALL.map((item) => (
              <li
                key={item}
                className="flex items-start gap-3 text-[15.5px] leading-[1.5] text-[#F4F1EA]"
              >
                <span
                  aria-hidden
                  className="mt-[3px] flex h-5 w-5 flex-none items-center justify-center rounded-full border border-[#E8B644]/30 bg-[#1E1809] text-[#E8B644]"
                >
                  <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none">
                    <path
                      d="M3.5 8.5l3 3 6-7"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                {item}
              </li>
            ))}
          </ul>

          <p className="mt-7 max-w-[30em] text-[15px] leading-[1.6] text-[#A9A499]">
            There&apos;s no deck and no card. If your DMs don&apos;t justify it
            we&apos;ll say so.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-[#F4F1EA]/[0.09] pt-5 text-[13.5px] text-[#8A8579]">
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
        </section>

        {/* The calendar */}
        <section id="calendar" aria-label="Pick a time" className="scroll-mt-6">
          <div className="overflow-hidden rounded-[24px] border border-[#A06E08]/25 bg-white shadow-[0_34px_70px_-40px_rgba(0,0,0,0.9)]">
            <iframe
              src={GHL_BOOKING_SRC}
              allow="payment"
              title="Book a call with HighThrive.ai"
              id={GHL_IFRAME_ID}
              scrolling="no"
              className="block"
              style={{
                width: "100%",
                border: "none",
                overflow: "hidden",
                minHeight: 700,
              }}
            />
          </div>
          <p className="mt-3 text-center text-[12.5px] text-[#8A8579]">
            No card, no obligation, cancel with one click.
          </p>
        </section>
      </main>

      <Script
        src="https://link.msgsndr.com/js/form_embed.js"
        strategy="afterInteractive"
      />

      <footer className="border-t border-[#F4F1EA]/10 bg-[#F4F1EA]/[0.02]">
        <div
          className={`${container} flex flex-wrap items-center justify-between gap-3 py-8 text-[12.5px] text-[#8A8579]`}
        >
          <span>&copy; {year} Speedsettr LLC. All rights reserved.</span>
          <div className="flex gap-4">
            <Link href="/privacy" className="transition-colors hover:text-[#F4F1EA]">
              Privacy policy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-[#F4F1EA]">
              Terms of service
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
