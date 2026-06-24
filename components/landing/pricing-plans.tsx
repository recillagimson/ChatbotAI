"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRICING } from "@/lib/pricing";

const FEATURES = [
  "Unlimited AI replies on Instagram & Messenger",
  "Trained on your business, voice & FAQ",
  "Conversation inbox with manual takeover",
  "Human-like reply pacing & auto follow-ups",
  "Multiple chatbots & connected accounts",
  "Priority support",
];

const MONTHLY = PRICING.monthly;
const ANNUAL_PER_MONTH = PRICING.annualPerMonth; // 10% off
const ANNUAL_TOTAL = PRICING.annualTotal; // 897 × 12, matches the Stripe annual price
const ANNUAL_SAVINGS = PRICING.annualSavings; // vs paying monthly for a year

export function PricingPlans() {
  const [annual, setAnnual] = useState(true);

  return (
    <div className="mx-auto max-w-md">
      {/* Billing-cycle toggle */}
      <div className="mb-8 flex justify-center">
        <div
          role="group"
          aria-label="Billing cycle"
          className="inline-flex items-center rounded-full border border-white/15 bg-white/5 p-1 text-sm"
        >
          <button
            type="button"
            aria-pressed={!annual}
            onClick={() => setAnnual(false)}
            className={cn(
              "rounded-full px-4 py-1.5 font-medium transition-colors",
              !annual ? "bg-white text-[#1e1b4b]" : "text-white/60 hover:text-white"
            )}
          >
            Monthly
          </button>
          <button
            type="button"
            aria-pressed={annual}
            onClick={() => setAnnual(true)}
            className={cn(
              "flex items-center gap-2 rounded-full px-4 py-1.5 font-medium transition-colors",
              annual ? "bg-white text-[#1e1b4b]" : "text-white/60 hover:text-white"
            )}
          >
            Yearly
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                annual ? "bg-[#6366f1] text-white" : "bg-white/10 text-white/70"
              )}
            >
              Save 10%
            </span>
          </button>
        </div>
      </div>

      {/* Plan card */}
      <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-white/[0.04] p-8 shadow-2xl">
        {/* glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#6366f1]/40 blur-3xl"
        />

        <div className="relative">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#c7d2fe]">
              Professional
            </span>
            <span className="rounded-full bg-[#6366f1] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
              All-inclusive
            </span>
          </div>

          <div className="mt-6 flex items-end gap-2">
            <span className="font-display text-6xl font-semibold leading-none tabular-nums">
              ${annual ? ANNUAL_PER_MONTH : MONTHLY}
            </span>
            <span className="pb-2 text-white/60">/ month</span>
          </div>

          <p className="mt-2 h-5 text-sm text-white/60">
            {annual ? (
              <>
                Billed annually at{" "}
                <span className="font-medium text-white">
                  ${ANNUAL_TOTAL.toLocaleString()}
                </span>{" "}
                — save ${ANNUAL_SAVINGS.toLocaleString()}/yr
              </>
            ) : (
              "Billed monthly. Switch to yearly to save 10%."
            )}
          </p>

          <Link
            href="/signup"
            className="mt-7 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#6366f1] font-semibold text-white transition-transform hover:scale-[1.02] hover:bg-[#818cf8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            Start now
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>

          <ul className="mt-8 space-y-3">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm text-white/80">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#6366f1]/20">
                  <Check className="h-3 w-3 text-[#c7d2fe]" aria-hidden />
                </span>
                {f}
              </li>
            ))}
          </ul>

          <p className="mt-6 text-center text-xs text-white/45">
            Cancel anytime. No setup fees.
          </p>
        </div>
      </div>
    </div>
  );
}
