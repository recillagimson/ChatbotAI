import type { Metadata, Viewport } from "next";
import { Outfit, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Body / UI font. Locked to Plus Jakarta Sans by the SpeedSettr dashboard
// blueprint - every label, row and paragraph in the app runs on it.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

// Display font: the "heavy geometric" wordmark spec from the logo PDF. Used for
// headings, the SPEEDSETTR wordmark, and every metric number (its tabular figures
// are what keep the stat cards from jittering).
const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  // 800 removed as dead config, NOT as a byte saving. It was the only weight
  // components/landing/brand-lockup.tsx painted, and that file was deleted as
  // an orphan; `font-extrabold` is now zero repo-wide, no CSS declares 800 and
  // there are no arbitrary font-[NNN] utilities, so nothing can reach it.
  // Measured: this changes no font bytes. Outfit is a VARIABLE font, so every
  // weight in this array resolves to the same two woff2 files - the array only
  // controls how many @font-face rules are emitted. The bytes a route actually
  // preloads are one file per FAMILY, so the only way to cut font weight is to
  // drop a whole family from routes that never paint it.
  // 300 STAYS: app/page.tsx:159 sets the display family on the whole landing,
  // so the hero eyebrow's `font-light` really does paint Outfit 300.
  weight: ["300", "400", "500", "600", "700"],
});

// JetBrains Mono is NOT declared here. It is reached only through
// `font-[family-name:var(--font-mono)]` in app/page.tsx and
// app/book-a-call/page.tsx, so each of those declares it and puts the
// .variable class on its own root wrapper. Declaring it here instead made
// every signed-in route preload a 30.6 kB family it never paints, because
// next/font preloads one file per family for every route under the layout
// that declares it.
//
// The dashboard's `font-mono` class is NOT this font and never was:
// tailwind.config.ts extends fontFamily with `sans` and `display` only, so
// Tailwind's font-mono resolves to the system mono stack. Nothing in
// app/(dashboard), (admin), (auth) or (legal) references --font-mono.

// Mobile viewport: fit the true device width and honor safe areas (notch /
// home indicator) via `viewport-fit=cover`. No `maximumScale`, since pinch-zoom
// must stay available for accessibility.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://www.speedsettr.com"),
  title: "SpeedSettr | AI replies for Instagram, Facebook, WhatsApp, Telegram & TikTok DMs",
  description:
    "Connect your Instagram and let AI answer your DMs 24/7, trained on your business, in your voice. Never miss a sale.",
  openGraph: {
    title: "SpeedSettr | AI replies for Instagram, Facebook, WhatsApp, Telegram & TikTok DMs",
    description:
      "Your AI teammate that answers Instagram, Facebook, WhatsApp, Telegram & TikTok DMs 24/7, in your voice.",
    url: "https://www.speedsettr.com",
    siteName: "SpeedSettr",
    type: "website",
    locale: "en_US",
  },
  // The artwork itself comes from app/opengraph-image.tsx + app/twitter-image.tsx
  // (Next injects the absolute URLs). This only picks the big-image card format -
  // without it X renders a small square thumbnail instead.
  twitter: {
    card: "summary_large_image",
    title: "SpeedSettr | AI replies for your Instagram, Facebook & TikTok DMs",
    description:
      "Your AI teammate answers every DM in seconds, trained on your business, in your voice.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${jakarta.variable} ${outfit.variable}`}>
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
