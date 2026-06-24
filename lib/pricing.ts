/**
 * Single source of truth for plan pricing (display values).
 *
 * The Stripe prices MUST match these exactly (test + live):
 *   • Monthly: $997.00 / month  → 99700 cents, interval=month
 *   • Annual:  $10,764.00 / year → 1076400 cents, interval=year  (= $897/mo, 10% off)
 *
 * Wire the env vars to the matching Stripe price IDs:
 *   STRIPE_PRICE_ID         → monthly price
 *   STRIPE_PRICE_ID_ANNUAL  → annual price
 */
export const PRICING = {
  monthly: 997,
  annualPerMonth: 897, // 10% off 997 (rounded)
  annualTotal: 10_764, // 897 × 12
  annualSavings: 1_200, // (997 − 897) × 12
  discountPct: 10,
} as const;

export type BillingCycle = "monthly" | "annual";
