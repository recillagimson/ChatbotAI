"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function BillingButtons({
  hasSubscription,
}: {
  hasSubscription: boolean;
}) {
  const [loading, setLoading] = useState<"checkout" | "portal" | null>(null);

  async function startCheckout() {
    setLoading("checkout");
    const res = await fetch("/api/stripe/checkout", { method: "POST" });
    const { url } = await res.json();
    if (url) window.location.href = url;
    else setLoading(null);
  }

  async function openPortal() {
    setLoading("portal");
    const res = await fetch("/api/stripe/portal", { method: "POST" });
    const { url } = await res.json();
    if (url) window.location.href = url;
    else setLoading(null);
  }

  return (
    <div className="flex gap-3">
      {!hasSubscription ? (
        <Button onClick={startCheckout} disabled={loading !== null}>
          {loading === "checkout" ? "Loading..." : "Subscribe — $349/mo"}
        </Button>
      ) : (
        <Button onClick={openPortal} disabled={loading !== null}>
          {loading === "portal" ? "Loading..." : "Manage subscription"}
        </Button>
      )}
    </div>
  );
}
