import Link from "next/link";
import { Lock } from "lucide-react";
import { BrandLockup } from "@/components/landing/brand-lockup";
import { COMPANY } from "@/lib/company";
import { LEGAL_LINKS } from "@/components/landing/site-footer";

/**
 * The marketing site's footer: brand, section links, and the contact details the
 * legal pages are obliged to publish, all in one strip.
 *
 * Contact values come from lib/company and the legal links from LEGAL_LINKS, so
 * this footer, the legal-page footer and the documents themselves can't drift
 * apart.
 */

const PRODUCT_LINKS = [
  { href: "#product", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

function ColumnHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10.5px] font-bold uppercase leading-none tracking-[0.14em] text-[#8b88b8]">
      {children}
    </div>
  );
}

const linkClass =
  "text-[13px] leading-none text-[#b6b4dd] transition-colors hover:text-[#c084fc]";

export function LandingFooter() {
  return (
    <footer className="relative z-10 border-t border-white/[0.07] bg-[#120f30]">
      <div className="container pb-8 pt-12 sm:pt-14">
        <div className="flex flex-col gap-10 lg:flex-row lg:gap-16">
          <div className="lg:w-[300px] lg:shrink-0">
            <BrandLockup size="sm" />
            <p className="mt-4 max-w-xs text-[12.5px] leading-[1.65] text-[#8b88b8]">
              AI that answers your DMs 24/7, trained on your business, in your
              voice.
            </p>
          </div>

          <div className="grid flex-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <ColumnHead>Product</ColumnHead>
              <div className="mt-3.5 flex flex-col gap-2.5">
                {PRODUCT_LINKS.map(({ href, label }) => (
                  <a key={href} href={href} className={linkClass}>
                    {label}
                  </a>
                ))}
                <Link href="/login" className={linkClass}>
                  Sign in
                </Link>
              </div>
            </div>

            <div>
              <ColumnHead>Contact</ColumnHead>
              <div className="mt-3.5 flex flex-col gap-2.5">
                <a href={`mailto:${COMPANY.email}`} className={linkClass}>
                  {COMPANY.email}
                </a>
                {COMPANY.phones.map((p) => (
                  <a key={p.tel} href={`tel:${p.tel}`} className={linkClass}>
                    {p.display}
                  </a>
                ))}
              </div>
            </div>

            <div>
              <ColumnHead>Office</ColumnHead>
              <address className="mt-3.5 text-[13px] not-italic leading-[1.6] text-[#b6b4dd]">
                {COMPANY.address}
              </address>
            </div>

            <div>
              <ColumnHead>Legal</ColumnHead>
              <nav aria-label="Legal" className="mt-3.5 flex flex-col gap-2.5">
                {LEGAL_LINKS.map(({ href, label }) => (
                  <Link key={href} href={href} className={linkClass}>
                    {label}
                  </Link>
                ))}
              </nav>
            </div>
          </div>
        </div>

        <div className="mt-9 flex flex-col gap-3 border-t border-white/[0.07] pt-5 text-[11.5px] leading-none text-[#8b88b8] sm:flex-row sm:items-center">
          <span>
            &copy; {new Date().getFullYear()} {COMPANY.name}. All rights
            reserved.
          </span>
          <span className="flex items-center gap-1.5 sm:ml-auto">
            <Lock className="h-3.5 w-3.5" aria-hidden />
            Encrypted in transit · payments by Stripe
          </span>
        </div>
      </div>
    </footer>
  );
}
