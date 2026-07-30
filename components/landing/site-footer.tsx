import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { COMPANY } from "@/lib/company";

/** Legal pages linked from every marketing/legal footer. */
export const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/disclaimer", label: "Disclaimer" },
  { href: "/refund-policy", label: "Refund Policy" },
  { href: "/advertising-disclosure", label: "Advertising Disclosure" },
  { href: "/accessibility", label: "Accessibility" },
] as const;

export function SiteFooter() {
  return (
    <footer className="relative z-10 border-t border-white/10">
      <div className="container py-10">
        <div className="flex flex-col items-center gap-7 sm:flex-row sm:items-center sm:justify-between">
          <Logo white size="sm" />

          <nav
            aria-label="Legal"
            className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-white/55"
          >
            {LEGAL_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="transition-colors hover:text-white"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-8 border-t border-white/10 pt-6 text-center text-sm text-white/45">
          &copy; {new Date().getFullYear()} {COMPANY.name}. All rights reserved.{" "}
          <span className="text-white/25">|</span> {COMPANY.address}
        </div>
      </div>
    </footer>
  );
}
