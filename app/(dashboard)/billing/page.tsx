import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getImpersonation } from "@/lib/impersonation";
import { Badge } from "@/components/ui/badge";
import { BillingButtons } from "@/components/dashboard/billing-buttons";
import { reconcileFromCheckoutSession } from "@/lib/billing";
import { hasActiveAccess, isComp } from "@/lib/access";
import {
  CheckCircle2,
  CalendarClock,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const FEATURES = [
  "Unlimited AI replies on Instagram, Facebook, WhatsApp, Telegram & TikTok",
  "Custom knowledge base & training",
  "Conversation inbox with manual takeover",
  "Multiple chatbots & connected accounts",
  "Human-like reply pacing & auto follow-ups",
  "Priority email support",
];

// Map a Stripe status to a human label + badge style.
function statusBadge(status: string | null | undefined) {
  switch (status) {
    case "active":
      return { label: "Active", variant: "success" as const };
    case "trialing":
      return { label: "Trial", variant: "success" as const };
    case "past_due":
      return { label: "Past due", variant: "warning" as const };
    case "canceled":
      return { label: "Canceled", variant: "secondary" as const };
    default:
      return { label: "Not subscribed", variant: "secondary" as const };
  }
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; session_id?: string }>;
}) {
  // Billing is out of scope for "view as client" (admins must not touch a
  // client's Stripe). Hidden from the sidebar; also redirect direct URL access.
  if ((await getImpersonation()).active) redirect("/dashboard");

  const { status, session_id } = await searchParams;
  const supabase = await createClient();
  const user = await getCurrentUser();

  // After a successful checkout, sync the subscription straight from Stripe so
  // the page is correct even if the webhook is delayed or not configured.
  if (status === "success" && session_id && user) {
    try {
      await reconcileFromCheckoutSession(session_id, user.id);
    } catch (err) {
      console.error("[billing] reconcile failed", err);
    }
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", user!.id)
    .maybeSingle();

  const active = hasActiveAccess(subscription);
  const comp = isComp(subscription) && active;
  const compUntil = subscription?.comp_expires_at
    ? new Date(subscription.comp_expires_at)
    : null;
  const hasCustomer = !!subscription?.stripe_customer_id;
  // Badge reflects real access, not the raw Stripe status: a comp that has
  // lapsed still has status='trialing' (no cron sweep), so key off `comp`/`active`
  // to avoid showing a green "Trial" badge to a user who no longer has access.
  const badge = isComp(subscription)
    ? comp
      ? { label: "Comp access", variant: "success" as const }
      : { label: "Expired", variant: "secondary" as const }
    : statusBadge(subscription?.status);
  const renews = subscription?.current_period_end
    ? new Date(subscription.current_period_end)
    : null;
  const canceling = subscription?.cancel_at_period_end;

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-display font-semibold tracking-tight">Billing</h1>
        <p className="text-muted-foreground mt-1">
          Manage your subscription and payment method.
        </p>
      </div>

      {/* Comp-access banner: shown to a client whose access was granted by an
          admin (no Stripe subscription). Replaces the misleading "Subscribe"-only
          framing with their real granted state + expiry. */}
      {comp && compUntil && (
        <div
          role="status"
          className="mb-6 flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3"
        >
          <Sparkles className="h-5 w-5 text-green-600 mt-0.5 shrink-0" aria-hidden />
          <div className="text-sm text-green-800">
            <p className="font-semibold">Comp access — active</p>
            <p>
              Your account has full access through{" "}
              <span className="font-medium">
                {compUntil.toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
              , courtesy of the SpeedSettr team. Subscribe anytime to continue after it ends.
            </p>
          </div>
        </div>
      )}

      {/* Return-from-Stripe banners */}
      {status === "success" && (
        <div
          role="status"
          className="mb-6 flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3"
        >
          <CheckCircle2
            className="h-5 w-5 text-green-600 mt-0.5 shrink-0"
            aria-hidden
          />
          <div className="text-sm text-green-800">
            <p className="font-semibold">You&apos;re all set.</p>
            <p>Your subscription is active. Welcome aboard!</p>
          </div>
        </div>
      )}
      {status === "cancelled" && !active && (
        <div
          role="status"
          className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
        >
          <CalendarClock
            className="h-5 w-5 text-amber-600 mt-0.5 shrink-0"
            aria-hidden
          />
          <div className="text-sm text-amber-800">
            <p className="font-semibold">Checkout canceled.</p>
            <p>No charge was made. You can subscribe whenever you&apos;re ready.</p>
          </div>
        </div>
      )}

      {/* Plan card */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {/* Brand accent bar signals this is the active/premium plan */}
        <div className="h-1.5 w-full bg-primary" aria-hidden />

        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                <Sparkles className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h2 className="text-xl font-semibold leading-tight">
                  Professional
                </h2>
                <p className="text-sm text-muted-foreground">
                  Everything you need to automate your DMs.
                </p>
              </div>
            </div>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>

          {/* Price */}
          <div className="mt-6">
            <div className="flex items-baseline gap-1.5">
              <span className="text-4xl font-display font-semibold tracking-tight tabular-nums">
                $997
              </span>
              <span className="text-muted-foreground">/ month</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Cancel anytime. No setup fees. Save 10% on yearly billing.
            </p>
          </div>

          {/* Renewal / cancellation strip (only when there's a billing period) */}
          {renews && (
            <div className="mt-5 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
              <CalendarClock
                className="h-4 w-4 text-muted-foreground shrink-0"
                aria-hidden
              />
              <span className="text-muted-foreground">
                {canceling ? "Your plan ends on " : "Renews on "}
                <span className="font-medium text-foreground">
                  {renews.toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              </span>
            </div>
          )}

          <div className="my-6 h-px bg-border" />

          {/* Features */}
          <p className="text-sm font-medium mb-3">
            {active ? "Included in your plan" : "What you'll get"}
          </p>
          <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-sm">
                <CheckCircle2
                  className="h-5 w-5 text-green-600 mt-0.5 shrink-0"
                  aria-hidden
                />
                <span className="text-muted-foreground">{feature}</span>
              </li>
            ))}
          </ul>

          {/* CTA */}
          <div className="mt-7">
            <BillingButtons hasSubscription={hasCustomer} />
          </div>
        </div>
      </div>

      {/* Trust line */}
      <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
        <span>
          Payments are securely processed by Stripe. We never store your card
          details.
        </span>
      </div>
    </div>
  );
}
