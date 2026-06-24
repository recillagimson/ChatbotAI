"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRICING, type BillingCycle } from "@/lib/pricing";

export function BillingButtons({
  hasSubscription,
}: {
  hasSubscription: boolean;
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

  if (hasSubscription) {
    return (
      <Button
        onClick={() => go("portal", "/api/stripe/portal")}
        disabled={loading !== null}
        size="lg"
        className="w-full sm:w-auto"
      >
        {loading === "portal" ? (
          <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden />
        ) : (
          <CreditCard className="h-4 w-4" aria-hidden />
        )}
        {loading === "portal" ? "Opening..." : "Manage subscription"}
      </Button>
    );
  }

  return (
    <div className="space-y-4">
      {/* Billing-cycle toggle */}
      <div
        role="group"
        aria-label="Billing cycle"
        className="inline-flex items-center rounded-full border bg-muted/50 p-1 text-sm"
      >
        <button
          type="button"
          aria-pressed={cycle === "monthly"}
          onClick={() => setCycle("monthly")}
          className={cn(
            "rounded-full px-4 py-1.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            cycle === "monthly"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Monthly
        </button>
        <button
          type="button"
          aria-pressed={cycle === "annual"}
          onClick={() => setCycle("annual")}
          className={cn(
            "flex items-center gap-2 rounded-full px-4 py-1.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            cycle === "annual"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Yearly
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
              cycle === "annual"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            )}
          >
            Save {PRICING.discountPct}%
          </span>
        </button>
      </div>

      <Button
        onClick={() => go("checkout", "/api/stripe/checkout", { cycle })}
        disabled={loading !== null}
        size="lg"
        className="w-full sm:w-auto"
      >
        {loading === "checkout" ? (
          <>
            <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden />
            Redirecting to checkout...
          </>
        ) : (
          <>
            Subscribe ·{" "}
            {cycle === "annual"
              ? `$${PRICING.annualPerMonth}/mo billed yearly`
              : `$${PRICING.monthly}/mo`}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </>
        )}
      </Button>

      {cycle === "annual" && (
        <p className="text-xs text-muted-foreground">
          ${PRICING.annualTotal.toLocaleString()} billed once a year — save $
          {PRICING.annualSavings.toLocaleString()}/yr.
        </p>
      )}
    </div>
  );
}
