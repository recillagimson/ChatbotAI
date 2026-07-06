import type { Subscription } from "./types";

/**
 * The subset of a `subscriptions` row needed to decide access. Widened so
 * callers can pass a narrow `select(...)` result without casting to the full
 * Subscription type.
 */
export type AccessRow = Pick<Subscription, "status" | "comp_expires_at"> & {
  stripe_subscription_id?: string | null;
};

/**
 * Single source of truth for "does this account have access right now."
 * Access = an active/trialing subscription that, if it is a comp grant, has not
 * yet reached its comp_expires_at. Real Stripe subs carry comp_expires_at = null
 * and reduce to the plain status test — behavior is unchanged for paying users.
 * Comp grants expire at check time (exact to the minute); no scheduled sweep.
 */
export function hasActiveAccess(
  sub: AccessRow | null | undefined,
  now: Date = new Date()
): boolean {
  if (!sub) return false;
  if (sub.status !== "active" && sub.status !== "trialing") return false;
  if (sub.comp_expires_at && new Date(sub.comp_expires_at) <= now) return false;
  return true;
}

/** True when the row is an admin comp grant: has an expiry and no live Stripe subscription. */
export function isComp(sub: AccessRow | null | undefined): boolean {
  return !!sub?.comp_expires_at && !sub?.stripe_subscription_id;
}

/**
 * `base` advanced by whole `days` and/or calendar `months`. Months are calendar-
 * aware and clamp month-end overflow (Jan 31 + 1 month -> Feb 28/29) so a grant
 * never silently rolls into a later month. All arithmetic is UTC to stay
 * deterministic across server timezones.
 */
export function computeExpiry(
  base: Date,
  { days = 0, months = 0 }: { days?: number; months?: number }
): Date {
  const d = new Date(base.getTime());
  if (months) {
    const day = d.getUTCDate();
    d.setUTCDate(1); // shift month from the 1st to avoid overflow (e.g. Mar 31 -> Mar 03)
    d.setUTCMonth(d.getUTCMonth() + months);
    const lastDay = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)
    ).getUTCDate();
    d.setUTCDate(Math.min(day, lastDay));
  }
  if (days) d.setUTCDate(d.getUTCDate() + days);
  return d;
}
