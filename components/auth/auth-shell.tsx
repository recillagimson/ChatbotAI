import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { BrandLockup } from "@/components/landing/brand-lockup";
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
  /** The bordered link in the top-right corner, e.g. "Create an account". */
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
    <div className="grain relative flex min-h-dvh flex-col overflow-hidden bg-[#15123a] text-white">
      {/* Backdrop. Absolute rather than a background on the flex container so a
          tall form (the sign-up card on a phone) scrolls over one wash instead
          of stretching the gradient's colour stops down the whole document. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(110%_90%_at_12%_0%,#2e2c6d_0%,#221f52_40%,#19163e_80%,#15123a_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-[60px] -top-[140px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(124,34,196,.3),transparent_68%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-[200px] left-[120px] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle,rgba(83,85,203,.2),transparent_70%)]"
      />

      <header className="relative flex items-center gap-3 px-5 py-5 sm:px-8">
        <Link href="/" aria-label="SpeedSettr home" className="w-fit">
          <BrandLockup size="sm" />
        </Link>
        {cta && (
          <Link
            href={cta.href}
            className="ml-auto flex shrink-0 items-center gap-1.5 rounded-ctl-lg border border-white/[0.16] px-3.5 py-2.5 text-[12.5px] font-semibold leading-none text-white transition-colors hover:border-white/30 hover:bg-white/[0.06]"
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
              "overflow-hidden rounded-[22px] border border-white/[0.11] bg-[#120f30] shadow-[0_50px_90px_-40px_rgba(0,0,0,.85)]",
              aside && "md:flex"
            )}
          >
            {/* min-w-0: without it this flex child's min-content (the widest
                unbreakable label) can push the card past its own max width. */}
            <div className="min-w-0 flex-1 p-6 sm:p-8">{children}</div>
            {aside && (
              <div className="border-t border-white/[0.08] bg-white/[0.04] p-6 sm:p-8 md:w-[312px] md:shrink-0 md:border-l md:border-t-0">
                {aside}
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2.5 px-1 text-[11.5px] leading-none text-[#8b88b8]">
            <span className="flex items-center gap-1.5">
              <Lock className="h-[14px] w-[14px]" aria-hidden />
              Encrypted in transit
            </span>
            <span className="flex items-center gap-4 sm:ml-auto">
              {FOOTER_LINKS.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="transition-colors hover:text-white"
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
      <h1 className="font-display text-[26px] font-bold leading-[1.15] tracking-[-0.02em] text-white sm:text-[28px]">
        {title}
      </h1>
      {children && (
        <p className="mt-2.5 text-[13.5px] leading-[1.5] text-[#8b88b8]">
          {children}
        </p>
      )}
    </div>
  );
}
