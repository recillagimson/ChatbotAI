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
  weight: ["400", "500", "600", "700", "800"],
});

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
