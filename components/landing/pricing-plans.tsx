"use client";

import { useState } from "react";
import Link from "next/link";
import { PRICING } from "@/lib/pricing";

/**
 * HighThrive.ai pricing card - one plan, monthly/yearly toggle.
 *
 * Prices come from lib/pricing.ts so the card, the JSON-LD offers and the Billing
 * screen can never quote different numbers. Amounts are formatted with an explicit
 * "en-US" locale so the server render and the client hydration match exactly.
 *
 * The CTA goes to /book-a-call, the standalone booking page, like every other
 * "Book a call" button on the site.
 */

const INCLUSIONS = [
  "Unlimited replies across all five channels",
  "As many accounts and bots as you run",
  "Knowledge base, training and tone controls",
  "Shared inbox with takeover and follow-ups",
  "Conversation and booking stats",
];

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

function termClass(active: boolean) {
  return [
    "rounded-full px-[18px] py-2 text-sm font-medium tracking-[-0.01em] transition-colors",
    active
      ? "bg-[linear-gradient(145deg,#F2C85C,#C9952A)] text-[#141414]"
      : "text-[#A9A499] hover:text-[#F4F1EA]",
  ].join(" ");
}

export function PricingPlans() {
  const [annual, setAnnual] = useState(true);

  const price = annual ? money(PRICING.annualPerMonth) : money(PRICING.monthly);
  const note = annual
    ? `Billed once a year at ${money(PRICING.annualTotal)}, which is ${money(
        PRICING.annualSavings
      )} less than paying month to month.`
    : `Billed every month, cancel whenever. Switching to yearly saves ${money(
        PRICING.annualSavings
      )}.`;

  return (
    <div className="mx-auto max-w-[880px] overflow-hidden rounded-[24px] border border-[#F4F1EA]/10 bg-[#111216] shadow-[0_24px_50px_-34px_rgba(0,0,0,0.85)]">
      <div className="grid grid-cols-1 md:grid-cols-2">
        {/* Plan + price */}
        <div className="border-b border-[#F4F1EA]/[0.09] p-8 md:border-b-0 md:border-r">
          <div className="text-lg font-semibold tracking-[-0.02em]">
            Professional
          </div>
          <div className="text-[13px] text-[#8A8579]">All-inclusive</div>

          <div className="mt-5 inline-flex gap-1 rounded-full border border-[#F4F1EA]/[0.14] bg-[#15161B] p-1">
            <button
              type="button"
              onClick={() => setAnnual(false)}
              aria-pressed={!annual}
              className={termClass(!annual)}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setAnnual(true)}
              aria-pressed={annual}
              className={termClass(annual)}
            >
              Yearly
            </button>
          </div>

          <div className="mt-5 flex items-baseline gap-2">
            <span className="text-[52px] font-semibold tracking-[-0.04em] text-[#E8B644]">
              {price}
            </span>
            <span className="text-[15px] text-[#A9A499]">/ month</span>
          </div>
          <div className="mt-2 min-h-[40px] text-[13.5px] leading-[1.5] text-[#A9A499]">
            {note}
          </div>

          <Link
            href="/book-a-call"
            className="mt-6 flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(145deg,#F2C85C,#C9952A)] px-5 py-3.5 text-[15.5px] font-semibold text-[#141414] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] transition-[filter] hover:brightness-105"
          >
            Book a call <span aria-hidden>&rarr;</span>
          </Link>
          <div className="mt-3 text-center text-[12.5px] text-[#8A8579]">
            We&apos;ll set it up live on the call.
          </div>
        </div>

        {/* What's included */}
        <div className="bg-[#15161B] p-8">
          <div className="text-[13px] text-[#8A8579]">What&apos;s in it</div>
          <div className="mt-4 grid gap-[11px] text-[14.5px] leading-[1.5] text-[#F4F1EA]">
            {INCLUSIONS.map((item) => (
              <div key={item}>{item}</div>
            ))}
          </div>
          <div className="mt-6 border-t border-[#F4F1EA]/[0.11] pt-[18px] text-[14px] leading-[1.55] text-[#A9A499]">
            At around two thousand conversations a month that&apos;s roughly{" "}
            <strong className="font-semibold text-[#F4F1EA]">50&cent; each</strong>
            , and one closed client usually covers the year&apos;s difference.
          </div>
        </div>
      </div>
    </div>
  );
}
