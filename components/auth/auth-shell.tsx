import Link from "next/link";
import {
  AuthBrandHeader,
  AuthBrandPanel,
  type AuthVariant,
} from "@/components/auth/auth-brand";

/**
 * The two-column auth shell: navy brand panel on the left, form on the right.
 *
 * It lives in a component rather than in (auth)/layout.tsx because the panel
 * differs per screen - sign-in shows proof, sign-up shows what happens next -
 * and a Next layout can't take props from the page it wraps.
 *
 * On a phone the panel becomes a short navy header above the form, so the
 * brand still lands first without eating the fold.
 */

const FOOTER_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "mailto:admin@speedsettr.com", label: "Support" },
];

export function AuthShell({
  variant,
  /** The "New here? / Already have an account?" line above the form. */
  top,
  children,
}: {
  variant: AuthVariant;
  top?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-white lg:flex-row">
      <AuthBrandPanel variant={variant} />
      <AuthBrandHeader variant={variant} />

      <div className="flex min-w-0 flex-1 flex-col px-6 py-7 sm:px-10 lg:px-14 lg:py-10">
        {top && (
          <div className="flex items-center gap-2 text-[12.5px] leading-none text-ss-muted">
            {top}
          </div>
        )}

        <div className="my-auto w-full max-w-[400px] py-8 lg:py-10">{children}</div>

        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 text-[11.5px] leading-none text-ss-faint">
          {FOOTER_LINKS.map(({ href, label }) => (
            <Link key={href} href={href} className="transition-colors hover:text-ss-body">
              {label}
            </Link>
          ))}
          <span className="w-full sm:ml-auto sm:w-auto">
            &copy; {new Date().getFullYear()} SpeedSettr
          </span>
        </div>
      </div>
    </div>
  );
}

/** The link pair above the form. */
export function AuthTop({
  prompt,
  href,
  cta,
}: {
  prompt: string;
  href: string;
  cta: string;
}) {
  return (
    <>
      {prompt}
      <Link
        href={href}
        className="font-semibold text-ss-indigo-600 transition-colors hover:text-ss-indigo-800"
      >
        {cta}
      </Link>
    </>
  );
}

/** Screen title + one line under it. */
export function AuthHeading({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="font-display text-[30px] font-bold leading-[1.15] tracking-[-0.02em] text-ss-ink">
        {title}
      </h1>
      {children && (
        <p className="mt-2.5 text-[13.5px] leading-[1.5] text-ss-muted">{children}</p>
      )}
    </div>
  );
}
