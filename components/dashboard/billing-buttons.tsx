"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, ArrowRight } from "lucide-react";

export function BillingButtons({
  hasSubscription,
}: {
  hasSubscription: boolean;
}) {
  const [loading, setLoading] = useState<"checkout" | "portal" | null>(null);

  async function go(kind: "checkout" | "portal", endpoint: string) {
    setLoading(kind);
    try {
      const res = await fetch(endpoint, { method: "POST" });
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
    <Button
      onClick={() => go("checkout", "/api/stripe/checkout")}
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
          Subscribe · $997/mo
          <ArrowRight className="h-4 w-4" aria-hidden />
        </>
      )}
    </Button>
  );
}
