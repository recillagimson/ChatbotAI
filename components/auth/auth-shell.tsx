import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { COMPANY } from "@/lib/company";
import { cn } from "@/lib/utils";

/**
 * The auth canvas: one dark page with the brand across the top and a single
 * card in the middle, matching the front page rather than sitting beside it.
 *
 * This replaced the navy-panel/white-form split. The split gave half the screen
 * to decoration on every viewport; here the same gradient runs behind
 * everything and the card is the only object, so the form is centred at any
 * width instead of drifting further from centre the wider the display gets.
 *
 * The public landing wears the HighThrive.ai brand, so the auth screens do too
 * (owner's call, 2026-09-21): the dark near-black + gold palette and the
 * HighThrive lockup below match the landing. The app behind sign-in (dashboard,
 * legal) is still SpeedSettr; the legal entity stays Speedsettr LLC.
 *
 * `aside` widens the card into two columns - the form on the left and a rail on
 * the right. Sign-up uses it to show what the money buys at the moment the
 * person is deciding; every other screen leaves it off and stays narrow.
 *
 * `.grain` carries the film texture and, more importantly, the dark-page focus
 * ring from globals.css, so no control here can ship without a visible one.
 */

const FOOTER_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: `mailto:${COMPANY.email}`, label: "Support" },
];

export function AuthShell({
  /** The bordered link in the top-right corner, e.g. "Book a call". */
  cta,
  /** Optional right-hand rail. Present = the wide two-column card. */
  aside,
  /** Optional block above the card, e.g. the sign-in welcome note. */
  above,
  children,
}: {
  cta?: { href: string; label: string };
  aside?: React.ReactNode;
  above?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grain relative flex min-h-dvh flex-col overflow-hidden bg-[#0A0A0C] text-[#F4F1EA]">
      {/* Backdrop. Absolute rather than a background on the flex container so a
          tall form (the sign-up card on a phone) scrolls over one wash instead
          of stretching the gradient's colour stops down the whole document. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_55%_at_78%_4%,rgba(232,182,68,0.13)_0%,rgba(232,182,68,0)_60%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-[200px] left-[80px] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle,rgba(232,182,68,.08),transparent_70%)]"
      />

      <header className="relative flex items-center gap-3 px-5 py-5 sm:px-8">
        <Link
          href="/"
          aria-label="HighThrive.ai home"
          className="flex w-fit items-center gap-2.5 text-[#F4F1EA]"
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 100 100"
            aria-hidden
            className="block shrink-0"
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
          <span className="flex flex-col leading-[1.15]">
            <span className="text-[18px] font-semibold tracking-[-0.025em]">
              HighThrive.ai
            </span>
            <span className="text-[10px] font-light uppercase tracking-[0.14em] text-[#8A8579]">
              AI Setter &amp; Closer
            </span>
          </span>
        </Link>
        {cta && (
          <Link
            href={cta.href}
            className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full border border-[#F4F1EA]/[0.16] bg-[#F4F1EA]/[0.05] px-4 py-2.5 text-[13px] font-medium leading-none text-[#F4F1EA] transition-colors hover:border-[#F4F1EA]/30 hover:bg-[#F4F1EA]/10"
          >
            {cta.label}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
      </header>

      <main className="relative flex flex-1 items-center justify-center px-5 pb-8 sm:px-8">
        <div className={cn("w-full", aside ? "max-w-[860px]" : "max-w-[440px]")}>
          {above && <div className="mb-3.5">{above}</div>}

          <div
            className={cn(
              "overflow-hidden rounded-[22px] border border-[#F4F1EA]/[0.1] bg-[#111216] shadow-[0_50px_90px_-40px_rgba(0,0,0,.85)]",
              aside && "md:flex"
            )}
          >
            {/* min-w-0: without it this flex child's min-content (the widest
                unbreakable label) can push the card past its own max width. */}
            <div className="min-w-0 flex-1 p-6 sm:p-8">{children}</div>
            {aside && (
              <div className="border-t border-[#F4F1EA]/[0.08] bg-[#F4F1EA]/[0.03] p-6 sm:p-8 md:w-[312px] md:shrink-0 md:border-l md:border-t-0">
                {aside}
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2.5 px-1 text-[11.5px] leading-none text-[#8A8579]">
            <span className="flex items-center gap-1.5">
              <Lock className="h-[14px] w-[14px]" aria-hidden />
              Encrypted in transit
            </span>
            <span className="flex items-center gap-4 sm:ml-auto">
              {FOOTER_LINKS.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="transition-colors hover:text-[#F4F1EA]"
                >
                  {label}
                </Link>
              ))}
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}

/** Screen title and the line under it. */
export function AuthHeading({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="font-display text-[26px] font-bold leading-[1.15] tracking-[-0.02em] text-[#F4F1EA] sm:text-[28px]">
        {title}
      </h1>
      {children && (
        <p className="mt-2.5 text-[13.5px] leading-[1.5] text-[#A9A499]">
          {children}
        </p>
      )}
    </div>
  );
}
