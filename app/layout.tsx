import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";

// Body / UI font — clean, modern grotesque.
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// Display font — editorial serif with character, used for headlines.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.speedsettr.com"),
  title: "SpeedSettr — AI replies for Instagram & Messenger DMs",
  description:
    "Connect your Instagram and let AI answer your DMs 24/7 — trained on your business, in your voice. Never miss a sale.",
  openGraph: {
    title: "SpeedSettr — AI replies for Instagram & Messenger DMs",
    description:
      "Your AI teammate that answers Instagram and Messenger DMs 24/7, in your voice.",
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
    <html lang="en" className={`${manrope.variable} ${fraunces.variable}`}>
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
