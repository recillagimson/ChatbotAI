"use client";

import { useState } from "react";
import { ArrowRight, CreditCard, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SsButton } from "@/components/ss/controls";
import { money } from "@/lib/format";
import { PRICING, type BillingCycle } from "@/lib/pricing";

/**
 * The Billing page's call to action.
 *
 * Two shapes. The default one is the plan card's subscribe control, with the
 * monthly/yearly toggle. `annual` is the compact version inside the navy yearly
 * panel - for someone who already subscribes, switching plans happens in
 * Stripe's portal, so that variant sends them there rather than offering a
 * second checkout that would create a duplicate subscription.
 */
export function BillingButtons({
  hasSubscription,
  annual = false,
}: {
  hasSubscription: boolean;
  annual?: boolean;
}) {
  const [loading, setLoading] = useState<"checkout" | "portal" | null>(null);
  const [cycle, setCycle] = useState<BillingCycle>("annual");

  async function go(
    kind: "checkout" | "portal",
    endpoint: string,
    body?: Record<string, unknown>
  ) {
    setLoading(kind);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        ...(body
          ? {
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            }
          : {}),
      });
      const { url } = await res.json();
      if (url) {
        window.location.href = url;
        return; // keep the spinner during the redirect
      }
    } catch {
      // fall through to re-enable the button
    }
    setLoading(null);
  }

  // ---- The yearly panel's button --------------------------------------
  if (annual) {
    const busy = loading !== null;
    return (
      <SsButton
        block
        variant="primary"
        size="lg"
        disabled={busy}
        onClick={() =>
          hasSubscription
            ? go("portal", "/api/stripe/portal")
            : go("checkout", "/api/stripe/checkout", { cycle: "annual" })
        }
      >
        {busy ? (
          <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
        ) : null}
        {busy
          ? "Opening…"
          : hasSubscription
            ? "Switch in the billing portal"
            : "Switch to yearly"}
        {!busy && <ArrowRight className="h-[17px] w-[17px]" aria-hidden="true" />}
      </SsButton>
    );
  }

  // ---- Existing subscriber --------------------------------------------
  if (hasSubscription) {
    return (
      <SsButton
        onClick={() => go("portal", "/api/stripe/portal")}
        disabled={loading !== null}
        variant="navy"
        size="lg"
      >
        {loading === "portal" ? (
          <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
        ) : (
          <CreditCard className="h-4 w-4" aria-hidden="true" />
        )}
        {loading === "portal" ? "Opening…" : "Manage subscription"}
      </SsButton>
    );
  }

  // ---- New subscriber ---------------------------------------------------
  return (
    <div className="flex flex-col gap-3.5">
      <div
        role="group"
        aria-label="Billing cycle"
        className="inline-flex w-fit items-center rounded-full border border-ss-line bg-white p-[3px]"
      >
        <button
          type="button"
          aria-pressed={cycle === "monthly"}
          onClick={() => setCycle("monthly")}
          className={cn(
            "rounded-full px-[15px] py-2 text-[12.5px] leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-indigo",
            cycle === "monthly"
              ? "bg-ss-navy font-bold text-white"
              : "font-medium text-ss-body hover:text-ss-ink"
          )}
        >
          Monthly
        </button>
        <button
          type="button"
          aria-pressed={cycle === "annual"}
          onClick={() => setCycle("annual")}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-[13px] py-2 text-[12.5px] leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-indigo",
            cycle === "annual"
              ? "bg-ss-navy font-bold text-white"
              : "font-medium text-ss-body hover:text-ss-ink"
          )}
        >
          Yearly
          <span
            className={cn(
              "rounded-[5px] px-1.5 py-0.5 text-[9.5px] font-bold uppercase leading-[1.5] tracking-wide",
              cycle === "annual"
                ? "bg-ss-mint text-[#053f2e]"
                : "bg-ss-chip text-ss-muted"
            )}
          >
            Save {PRICING.discountPct}%
          </span>
        </button>
      </div>

      <SsButton
        onClick={() => go("checkout", "/api/stripe/checkout", { cycle })}
        disabled={loading !== null}
        variant="primary"
        size="lg"
        className="w-full sm:w-auto"
      >
        {loading === "checkout" ? (
          <>
            <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
            Redirecting to checkout…
          </>
        ) : (
          <>
            Subscribe ·{" "}
            {cycle === "annual"
              ? `${money(PRICING.annualPerMonth)}/mo billed yearly`
              : `${money(PRICING.monthly)}/mo`}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </>
        )}
      </SsButton>

      <p className="text-[11.5px] leading-relaxed text-ss-muted">
        {cycle === "annual"
          ? `${money(PRICING.annualTotal)} billed once a year - you keep ${money(PRICING.annualSavings)}.`
          : "Cancel any time. No setup fees."}
      </p>
    </div>
  );
}
