/**
 * The auth route group is a bare passthrough: each screen renders its own
 * <AuthShell>, because the top-right link and the optional rail differ per
 * screen and a Next layout can't take props from the page inside it.
 *
 * The dark ground is set here as well as in the shell so a slow page never
 * flashes white behind the transition.
 */
import type { Metadata } from "next";

// The auth screens (login / signup / forgot-password / reset-password) are
// publicly reachable but must never appear in Google - a thin login page must
// not rank in place of the landing page. Keep them crawlable-but-noindex so
// Google can actually see this tag; do NOT also Disallow them in robots.ts.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-dvh bg-[#0A0A0C]">{children}</div>;
}
