import type Stripe from "stripe";
import { getStripe } from "./stripe";
import { createServiceClient } from "./supabase/server";

/**
 * Read the current period end (unix seconds) from a Stripe subscription,
 * tolerating both the legacy top-level field and the newer per-item location
 * (Stripe moved it to subscription items in the 2025 "basil" API version).
 */
function periodEndIso(sub: Stripe.Subscription): string | null {
  const item = sub.items.data[0];
  const unix =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    (item as unknown as { current_period_end?: number })?.current_period_end ??
    null;
  return unix ? new Date(unix * 1000).toISOString() : null;
}

/**
 * Upsert a Stripe subscription into our `subscriptions` table (keyed by user).
 * Shared by the Stripe webhook and the billing-success reconcile path so the
 * two can never drift apart. Runs with the service-role client (bypasses RLS).
 */
export async function upsertSubscriptionRow(
  sub: Stripe.Subscription,
  userId: string
): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: sub.customer as string,
      stripe_subscription_id: sub.id,
      stripe_price_id: sub.items.data[0]?.price.id ?? null,
      status: sub.status,
      current_period_end: periodEndIso(sub),
      cancel_at_period_end: sub.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
}

/**
 * Reconcile the user's subscription directly from a completed Checkout Session.
 *
 * Defense-in-depth: the /billing success page calls this so a delayed or
 * unconfigured webhook can't leave the UI stuck on "Subscribe" after a
 * successful payment. No-ops quietly if the session has no subscription or
 * belongs to a different user.
 */
export async function reconcileFromCheckoutSession(
  sessionId: string,
  userId: string
): Promise<void> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  // Guard: only sync sessions that belong to this signed-in user.
  const sessionUser = session.metadata?.supabase_user_id as string | undefined;
  if (sessionUser && sessionUser !== userId) return;
  if (!session.subscription) return;

  const sub = await stripe.subscriptions.retrieve(
    session.subscription as string
  );
  await upsertSubscriptionRow(sub, userId);
}
