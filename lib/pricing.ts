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
/** Display name of the single plan. The dashboard shows it on Billing, in the
 *  sidebar plan card, and in the invoice description column. */
export const PLAN_NAME = "Professional";

/** One-line plan promise, shown under the name on the Billing card. */
export const PLAN_TAGLINE = "Everything you need to automate your DMs.";

/** What the plan includes - the Billing screen's checklist, and the same list
 *  the public pricing card renders, so the two can never quote different
 *  inclusions. */
export const PLAN_FEATURES: string[] = [
  "Unlimited AI replies on Instagram, Facebook, WhatsApp, Telegram & TikTok",
  "Unlimited chatbots & connected accounts",
  "Knowledge base & bot training",
  "Conversation inbox with manual takeover",
  "Human-like reply pacing & auto follow-ups",
  "Statistics & funnel tracking",
  "Priority support by phone & email",
];

export const PRICING = {
  monthly: 997,
  annualPerMonth: 897, // 10% off 997 (rounded)
  annualTotal: 10_764, // 897 × 12
  annualSavings: 1_200, // (997 − 897) × 12
  discountPct: 10,
} as const;

export type BillingCycle = "monthly" | "annual";
