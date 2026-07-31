"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Calculator, CheckCircle2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLAN_FEATURES, PLAN_NAME, PRICING } from "@/lib/pricing";

/**
 * The single plan, on the dark card.
 *
 * The feature list is `PLAN_FEATURES` from lib/pricing - the same array the
 * Billing screen renders. Marketing and billing quoting different inclusions is
 * the classic way a pricing page starts lying, so there is only one list.
 */

/** An illustrative unit cost, not a measured one - see the note it renders in. */
const EXAMPLE_VOLUME = 2000;

/* Number formatting is pinned to en-US. A bare toLocaleString() uses the
   *server's* locale when this client component is prerendered and the
   *browser's* on hydration, so a visitor in a comma-vs-period locale would get
   a React hydration mismatch on the price. */

export function PricingPlans() {
  const [annual, setAnnual] = useState(true);

  const perMonth = annual ? PRICING.annualPerMonth : PRICING.monthly;
  const centsEach = Math.round((PRICING.monthly / EXAMPLE_VOLUME) * 100);

  return (
    <>
      {/* Billing cycle */}
      <div className="flex justify-center">
        <div
          role="group"
          aria-label="Billing cycle"
          className="flex rounded-full border border-white/[0.12] bg-white/[0.05] p-1"
        >
          <button
            type="button"
            aria-pressed={!annual}
            onClick={() => setAnnual(false)}
            className={cn(
              "rounded-full px-[18px] py-2.5 text-[13px] font-semibold leading-none transition-colors",
              annual
                ? "text-[#8b88b8] hover:text-white"
                : "bg-[linear-gradient(120deg,#7c22c4,#5355cb)] text-white"
            )}
          >
            Monthly
          </button>
          <button
            type="button"
            aria-pressed={annual}
            onClick={() => setAnnual(true)}
            className={cn(
              "flex items-center gap-2 rounded-full px-[18px] py-2.5 text-[13px] font-semibold leading-none transition-colors",
              annual
                ? "bg-[linear-gradient(120deg,#7c22c4,#5355cb)] text-white"
                : "text-[#8b88b8] hover:text-white"
            )}
          >
            Yearly
            <span className="rounded-md bg-[#34d399] px-1.5 py-0.5 text-[9.5px] font-bold leading-[1.5] text-[#053f2e]">
              SAVE {PRICING.discountPct}%
            </span>
          </button>
        </div>
      </div>

      {/* Plan card */}
      <div className="mt-7 flex justify-center">
        <div className="w-full max-w-[840px] overflow-hidden rounded-[24px] border border-white/[0.11] bg-[#120f30] shadow-[0_50px_90px_-50px_rgba(0,0,0,.9)]">
          <div className="h-1.5 bg-[linear-gradient(90deg,#7c22c4,#5355cb,#818cf8)]" />

          <div className="flex flex-col md:flex-row">
            {/* Price. Centred, because the inclusions column is always taller
                and a top-aligned price leaves a hole under the CTA. */}
            <div className="border-b border-white/[0.08] p-8 md:flex md:w-[330px] md:shrink-0 md:flex-col md:justify-center md:border-b-0 md:border-r">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#7c22c4]/20">
                  <Sparkles className="h-[19px] w-[19px] text-[#c084fc]" aria-hidden />
                </span>
                <div>
                  <div className="font-display text-[17px] font-bold leading-none text-white">
                    {PLAN_NAME}
                  </div>
                  <div className="mt-1 text-[11.5px] leading-none text-[#8b88b8]">
                    All-inclusive
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-baseline gap-2">
                <span className="font-display text-[46px] font-bold leading-none tracking-[-0.03em] text-white tabular-nums">
                  ${perMonth}
                </span>
                <span className="text-sm font-medium text-[#8b88b8]">/ month</span>
              </div>

              {/* Fixed height so switching cycles doesn't shift the button. */}
              <p className="mt-2.5 min-h-[38px] text-[12.5px] leading-[1.5] text-[#8b88b8]">
                {annual ? (
                  <>
                    Billed annually at{" "}
                    <span className="font-semibold text-white">
                      ${PRICING.annualTotal.toLocaleString("en-US")}
                    </span>{" "}
                    - you keep ${PRICING.annualSavings.toLocaleString("en-US")} a year.
                  </>
                ) : (
                  <>
                    Billed monthly. Switch to yearly any time and save{" "}
                    {PRICING.discountPct}%.
                  </>
                )}
              </p>

              <Link
                href="/signup"
                className="mt-[22px] flex items-center justify-center gap-2 rounded-chip bg-[linear-gradient(120deg,#7c22c4,#5355cb)] p-[15px] text-sm font-bold leading-none text-white shadow-[0_16px_32px_-16px_rgba(124,34,196,.95)] transition-transform hover:scale-[1.02]"
              >
                Get started
                <ArrowRight className="h-[18px] w-[18px]" aria-hidden />
              </Link>
              <p className="mt-3.5 text-center text-[11.5px] leading-[1.5] text-[#8b88b8]">
                No card to create your account · cancel any time
              </p>
            </div>

            {/* Inclusions */}
            <div className="min-w-0 flex-1 p-8">
              <div className="text-[11px] font-bold uppercase leading-none tracking-[0.1em] text-[#8b88b8]">
                Everything included
              </div>

              <ul className="mt-[18px] grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
                {PLAN_FEATURES.map((f) => (
                  <li
                    key={f}
                    className="flex gap-2.5 text-[13px] leading-[1.5] text-white"
                  >
                    <CheckCircle2
                      className="h-[17px] w-[17px] shrink-0 text-[#34d399]"
                      aria-hidden
                    />
                    {f}
                  </li>
                ))}
              </ul>

              <div className="mt-[22px] flex items-center gap-3 rounded-[13px] border border-white/[0.09] bg-white/[0.04] px-4 py-3.5">
                <Calculator className="h-[18px] w-[18px] shrink-0 text-[#c084fc]" aria-hidden />
                <p className="text-[12.5px] leading-[1.55] text-[#b6b4dd]">
                  One closed deal a month usually covers it. As an example, at{" "}
                  {EXAMPLE_VOLUME.toLocaleString("en-US")} conversations a month that
                  works out to{" "}
                  <strong className="font-semibold text-white">
                    about {centsEach}¢ per conversation answered
                  </strong>
                  .
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
