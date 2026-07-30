import type { Metadata, Viewport } from "next";
import { Sora, Manrope } from "next/font/google";
import "./globals.css";

// Body / UI font: clean, modern grotesque.
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// Display font: heavy geometric sans for the high-velocity brand voice
// (headlines + the SPEEDSETTR wordmark). Per the SpeedSettr brand blueprint.
const sora = Sora({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["500", "600", "700", "800"],
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
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${manrope.variable} ${sora.variable}`}>
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
