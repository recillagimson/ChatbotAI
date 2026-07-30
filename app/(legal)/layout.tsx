import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { SiteFooter } from "@/components/landing/site-footer";
import { ContactCard } from "@/components/landing/contact-card";

/**
 * Shell for the public legal pages (privacy, terms, disclaimer, refund,
 * advertising disclosure, accessibility). Same dark brand surface as the
 * landing page, with the marketing nav and the shared legal footer.
 */
export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#15123a] text-white grain">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-[#6366f1]/20 blur-[120px]"
      />

      <header className="relative z-20 border-b border-black/5 bg-white shadow-sm">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" aria-label="SpeedSettr home">
            <Logo />
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              href="/login"
              className="text-sm font-medium text-[#1e1b4b]/70 transition-colors hover:text-[#1e1b4b]"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-[#6366f1] px-5 py-2 text-sm font-semibold text-white transition-transform hover:scale-[1.03] hover:bg-[#818cf8]"
            >
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      <main className="relative z-10">{children}</main>

      <ContactCard />

      <SiteFooter />
    </div>
  );
}
