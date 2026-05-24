import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChatPilot — AI replies for Instagram & Messenger DMs",
  description:
    "Connect your Instagram and let AI handle DMs for your business 24/7.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
