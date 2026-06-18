import Link from "next/link";
import {
  Instagram,
  Zap,
  BookOpen,
  Inbox,
  ArrowRight,
  Clock,
  Sparkles,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { PricingPlans } from "@/components/landing/pricing-plans";

const FEATURES = [
  {
    icon: Zap,
    title: "Instant AI replies",
    body: "Powered by Claude — the most natural-sounding AI for conversations. Replies in seconds, in your exact tone.",
  },
  {
    icon: BookOpen,
    title: "Trained on your business",
    body: "Paste your FAQ, hours, pricing and policies. The AI answers from your real knowledge instead of guessing.",
  },
  {
    icon: Inbox,
    title: "Unified inbox & takeover",
    body: "Every conversation in one place. Pause the AI and jump in to close the deal yourself, any time.",
  },
];

const STEPS = [
  { n: "01", title: "Connect Instagram", body: "Link your account through ManyChat in a few clicks." },
  { n: "02", title: "Train your AI", body: "Add your business knowledge, voice and tone." },
  { n: "03", title: "Go live", body: "Your AI starts replying and closing — 24/7." },
];

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#180530] text-white grain">
      {/* Ambient glow orbs */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-[#6B2FB5]/30 blur-[120px] animate-drift"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[28rem] -right-40 h-[28rem] w-[28rem] rounded-full bg-[#4311a0]/30 blur-[120px] animate-drift"
      />

      {/* Nav */}
      <header className="relative z-20 border-b border-white/10 backdrop-blur-sm">
        <div className="container flex h-16 items-center justify-between">
          <Logo dark />
          <nav className="flex items-center gap-6">
            <Link
              href="/login"
              className="text-sm font-medium text-white/70 transition-colors hover:text-white"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-[#2E0A52] transition-transform hover:scale-[1.03]"
            >
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10">
        <div className="container py-24 text-center sm:py-32">
          <div className="mx-auto max-w-3xl">
            <div className="animate-rise inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/80">
              <Instagram className="h-3.5 w-3.5 text-[#A974F0]" />
              Always-on AI for Instagram &amp; Messenger
            </div>

            <h1
              className="animate-rise mt-7 font-display text-5xl font-semibold leading-[1.05] tracking-tight sm:text-7xl"
              style={{ animationDelay: "80ms" }}
            >
              Never miss a DM.
              <br />
              Never miss a{" "}
              <span className="italic text-[#A974F0]">sale</span>.
            </h1>

            <p
              className="animate-rise mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/65"
              style={{ animationDelay: "160ms" }}
            >
              SpeedSettr is your AI teammate that answers Instagram and
              Messenger DMs 24/7 — trained on your business, your tone, and your
              FAQ. Closing leads while you sleep.
            </p>

            <div
              className="animate-rise mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
              style={{ animationDelay: "240ms" }}
            >
              <Link
                href="/signup"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#6B2FB5] px-7 font-semibold text-white shadow-lg shadow-[#6B2FB5]/30 transition-transform hover:scale-[1.03] hover:bg-[#7d3fce] sm:w-auto"
              >
                Start now — $997/mo
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="#how-it-works"
                className="flex h-12 w-full items-center justify-center rounded-full border border-white/20 px-7 font-semibold text-white transition-colors hover:bg-white/10 sm:w-auto"
              >
                See how it works
              </Link>
            </div>

            {/* Stat row */}
            <div
              className="animate-rise mx-auto mt-14 grid max-w-lg grid-cols-3 gap-4 border-t border-white/10 pt-8"
              style={{ animationDelay: "320ms" }}
            >
              {[
                { icon: Clock, stat: "24/7", label: "always replying" },
                { icon: Zap, stat: "<30s", label: "response time" },
                { icon: Sparkles, stat: "100%", label: "in your voice" },
              ].map(({ icon: Icon, stat, label }) => (
                <div key={label} className="flex flex-col items-center">
                  <Icon className="mb-2 h-5 w-5 text-[#A974F0]" aria-hidden />
                  <div className="font-display text-2xl font-semibold tabular-nums">
                    {stat}
                  </div>
                  <div className="text-xs text-white/50">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="how-it-works" className="relative z-10 border-t border-white/10">
        <div className="container py-20">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <h2 className="font-display text-3xl font-semibold sm:text-4xl">
              Everything you need to automate your DMs
            </h2>
            <p className="mt-3 text-white/60">
              Set up once. Let your AI handle the rest.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="group rounded-2xl border border-white/10 bg-white/[0.03] p-7 transition-colors hover:border-white/20 hover:bg-white/[0.05]"
              >
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[#6B2FB5]/20 text-[#A974F0]">
                  <Icon className="h-6 w-6" aria-hidden />
                </div>
                <h3 className="mb-2 text-lg font-semibold">{title}</h3>
                <p className="text-sm leading-relaxed text-white/60">{body}</p>
              </div>
            ))}
          </div>

          {/* Steps */}
          <div className="mt-16 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-3">
            {STEPS.map(({ n, title, body }) => (
              <div key={n} className="bg-[#180530] p-7">
                <div className="font-display text-3xl font-semibold text-[#6B2FB5]">
                  {n}
                </div>
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-white/55">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="relative z-10 border-t border-white/10">
        <div className="container py-20">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="font-display text-3xl font-semibold sm:text-4xl">
              One plan. Everything included.
            </h2>
            <p className="mt-3 text-white/60">
              No tiers, no add-ons. Save 10% when you pay yearly.
            </p>
          </div>
          <PricingPlans />
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative z-10 border-t border-white/10">
        <div className="container py-20">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#3a128a] to-[#2E0A52] p-10 text-center sm:p-16">
            <div
              aria-hidden
              className="pointer-events-none absolute -left-20 top-0 h-64 w-64 rounded-full bg-[#6B2FB5]/40 blur-3xl"
            />
            <div className="relative mx-auto max-w-xl">
              <h2 className="font-display text-3xl font-semibold sm:text-4xl">
                Your next customer is already in your DMs.
              </h2>
              <p className="mt-4 text-white/70">
                Let SpeedSettr answer them in seconds — day or night.
              </p>
              <Link
                href="/signup"
                className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-8 font-semibold text-[#2E0A52] transition-transform hover:scale-[1.03]"
              >
                Get started
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/10">
        <div className="container flex flex-col items-center justify-between gap-4 py-8 text-sm text-white/45 sm:flex-row">
          <Logo dark size="sm" />
          <span>
            &copy; {new Date().getFullYear()} SpeedSettr. All rights reserved.
          </span>
        </div>
      </footer>
    </div>
  );
}
