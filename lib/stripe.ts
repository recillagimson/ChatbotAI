import Stripe from "stripe";

let _stripe: Stripe | null = null;

/**
 * Lazily construct the Stripe client.
 *
 * We must NOT instantiate Stripe at module load time. Next.js imports route
 * modules while "collecting page data" during `next build`, and the Stripe SDK
 * throws ("Neither apiKey nor config.authenticator provided") if
 * STRIPE_SECRET_KEY isn't present at that moment. Constructing on first request
 * keeps the build green and only needs the key at runtime.
 */
export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(key, {
      apiVersion: "2025-02-24.acacia",
      typescript: true,
    });
  }
  return _stripe;
}

export const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID!;

export function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}
