import { Check } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";

const BULLETS = [
  "Replies to every DM 24/7, in your voice",
  "Trained on your business, FAQ & pricing",
  "Jump in and take over any chat to close",
];

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-2">
      {/* Brand panel (desktop only) */}
      <div className="relative hidden overflow-hidden bg-[#15123a] text-white grain lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-[#6366f1]/30 blur-[120px] animate-drift"
        />
        <Link href="/" className="relative z-10" aria-label="SpeedSettr">
          <Logo white />
        </Link>

        <div className="relative z-10">
          <h2 className="font-display text-4xl font-semibold leading-[1.1]">
            Your AI teammate that never misses a{" "}
            <span className="italic text-[#a5b4fc]">sale</span>.
          </h2>
          <ul className="mt-8 space-y-4">
            {BULLETS.map((b) => (
              <li key={b} className="flex items-start gap-3 text-white/75">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#6366f1]/30">
                  <Check className="h-3 w-3 text-[#a5b4fc]" aria-hidden />
                </span>
                {b}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-sm text-white/45">
          Built for creators, coaches & high-ticket service businesses.
        </p>
      </div>

      {/* Form area */}
      <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-secondary/50 via-background to-background p-6">
        <div className="w-full max-w-md">
          <Link
            href="/"
            className="mb-8 flex justify-center lg:hidden"
            aria-label="SpeedSettr"
          >
            <Logo />
          </Link>
          {children}
        </div>
      </div>
    </div>
  );
}
