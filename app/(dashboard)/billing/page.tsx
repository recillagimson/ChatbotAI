import { redirect } from "next/navigation";
import Link from "next/link";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  CreditCard,
  Info,
  PiggyBank,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getImpersonation } from "@/lib/impersonation";
import { getWorkspace } from "@/lib/workspace";
import { BillingButtons } from "@/components/dashboard/billing-buttons";
import { reconcileFromCheckoutSession } from "@/lib/billing";
import { hasActiveAccess, isComp } from "@/lib/access";
import { PLAN_FEATURES, PLAN_NAME, PLAN_TAGLINE, PRICING } from "@/lib/pricing";
import { money, num, shortDate } from "@/lib/format";
import { PageBody, PageHeader, PageShell, Callout } from "@/components/ss/page";
import { SsCard, SsCardHead, SsIconTile } from "@/components/ss/card";
import { SsStatus } from "@/components/ss/controls";
import { NavyPanel, PanelEyebrow } from "@/components/ss/panel";

export const dynamic = "force-dynamic";

/** Map a Stripe status to a human label + tone. */
function statusOf(status: string | null | undefined) {
  switch (status) {
    case "active":
      return { label: "Active", tone: "green" as const };
    case "trialing":
      return { label: "Trial", tone: "green" as const };
    case "past_due":
      return { label: "Past due", tone: "amber" as const };
    case "canceled":
      return { label: "Canceled", tone: "neutral" as const };
    default:
      return { label: "Not subscribed", tone: "neutral" as const };
  }
}

/**
 * Billing - what you pay, when it leaves your account, and what it covers.
 *
 * The design's three-across summary strip answers the only questions anyone
 * opens this page for, before any of the plan detail. The yearly pitch is a navy
 * panel doing the maths out loud rather than a "save 10%" badge, because the
 * number that persuades is the annual total, not the percentage.
 */
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

  const [{ data: subscription }, workspace] = await Promise.all([
    supabase.from("subscriptions").select("*").eq("user_id", user!.id).maybeSingle(),
    getWorkspace(null),
  ]);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const { count: repliesThisMonth } = await supabase
    .from("usage_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user!.id)
    .eq("event_type", "ai_reply")
    .gte("created_at", monthStart.toISOString());

  const active = hasActiveAccess(subscription);
  const comp = isComp(subscription) && active;
  const compUntil = subscription?.comp_expires_at
    ? new Date(subscription.comp_expires_at)
    : null;
  const hasCustomer = !!subscription?.stripe_customer_id;
  // Never offer a fresh checkout to someone whose access is already on. A comp
  // or manually-granted account has no Stripe customer, so it would otherwise
  // fall through to the "new subscriber" buttons and could be charged for a
  // second subscription on top of access it already has.
  const offerCheckout = hasCustomer || !active;
  // The chip reflects real access, not the raw Stripe status: a comp that has
  // lapsed still reads status='trialing' (there's no cron sweep), so key off
  // `comp`/`active` rather than showing a green badge to someone locked out.
  const chip = isComp(subscription)
    ? comp
      ? { label: "Comp access", tone: "green" as const }
      : { label: "Expired", tone: "neutral" as const }
    : statusOf(subscription?.status);
  const renews = subscription?.current_period_end
    ? new Date(subscription.current_period_end)
    : null;
  const canceling = subscription?.cancel_at_period_end;

  const daysToRenewal = renews
    ? Math.max(0, Math.ceil((renews.getTime() - Date.now()) / 86_400_000))
    : null;

  const channelsConnected = new Set(
    (workspace?.bots ?? []).flatMap((b) => b.platforms)
  ).size;

  return (
    <PageShell>
      <PageHeader
        title="Billing"
        description="One subscription covers every chatbot in this workspace."
        actions={
          <SsStatus tone={chip.tone}>{chip.label}</SsStatus>
        }
      />

      <PageBody center maxWidth={940}>
        {/* ---- Return-from-Stripe + comp banners ----------------------- */}
        {comp && compUntil && (
          <Callout
            tone="indigo"
            icon={<Sparkles className="h-[18px] w-[18px] text-ss-indigo-600" aria-hidden="true" />}
            title="Comp access - active"
          >
            Your account has full access through{" "}
            <strong className="font-semibold text-ss-ink">
              {shortDate(compUntil)}
            </strong>
            , courtesy of the SpeedSettr team. Subscribe any time to continue
            after it ends.
          </Callout>
        )}
        {status === "success" && (
          <Callout
            tone="plain"
            icon={<CheckCircle2 className="h-[18px] w-[18px] text-ss-green" aria-hidden="true" />}
            title="You're all set."
          >
            Your subscription is active. Welcome aboard.
          </Callout>
        )}
        {status === "cancelled" && !active && (
          <Callout
            tone="amber"
            icon={<CalendarClock className="h-[18px] w-[18px] text-ss-amber" aria-hidden="true" />}
            title="Checkout canceled."
          >
            No charge was made. You can subscribe whenever you&apos;re ready.
          </Callout>
        )}

        {/* ---- The three questions ------------------------------------- */}
        <SsCard className="grid overflow-hidden md:grid-cols-3">
          <div className="px-[22px] py-5">
            <div className="ss-eyebrow tracking-[0.12em] text-ss-muted">
              Current plan
            </div>
            <div className="mt-2.5 flex items-center gap-2.5">
              <span className="font-display text-lg font-bold leading-none text-ss-ink">
                {PLAN_NAME}
              </span>
              <SsStatus tone={chip.tone}>{chip.label}</SsStatus>
            </div>
            <div className="mt-2 text-[12px] leading-none text-ss-muted">
              Monthly · unlimited replies
            </div>
          </div>

          <div className="border-t border-ss-hair px-[22px] py-5 md:border-l md:border-t-0">
            <div className="ss-eyebrow tracking-[0.12em] text-ss-muted">
              {canceling ? "Access ends" : "Next payment"}
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="ss-num text-lg leading-none text-ss-ink">
                {renews ? money(PRICING.monthly, true) : "-"}
              </span>
              <span className="text-[12px] font-medium leading-none text-ss-muted">
                {renews ? `on ${shortDate(renews)}` : "no active subscription"}
              </span>
            </div>
            <div className="mt-2 text-[12px] leading-none text-ss-muted">
              {daysToRenewal != null
                ? `in ${daysToRenewal} day${daysToRenewal === 1 ? "" : "s"} · ${canceling ? "then it stops" : "charged automatically"}`
                : "subscribe to start your plan"}
            </div>
          </div>

          <div className="border-t border-ss-hair px-[22px] py-5 md:border-l md:border-t-0">
            <div className="ss-eyebrow tracking-[0.12em] text-ss-muted">
              Payment method
            </div>
            <div className="mt-2.5 flex items-center gap-2.5">
              <CreditCard className="h-5 w-5 shrink-0 text-ss-muted" aria-hidden="true" />
              <span className="text-[13px] font-semibold leading-none text-ss-ink">
                {hasCustomer ? "On file with Stripe" : "None yet"}
              </span>
            </div>
            <div className="mt-2 text-[12px] leading-none text-ss-muted">
              {hasCustomer
                ? "Update it in the billing portal below"
                : "Added at checkout"}
            </div>
          </div>
        </SsCard>

        {/* ---- Plan + yearly ------------------------------------------- */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start">
          <SsCard className="overflow-hidden shadow-ss-plan">
            <div
              className="h-[5px] bg-[linear-gradient(90deg,#6366f1,#a5b4fc)]"
              aria-hidden="true"
            />
            <div className="p-[22px]">
              <div className="flex flex-wrap items-start gap-3">
                <SsIconTile tone="indigo" size={38}>
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                </SsIconTile>
                <div className="min-w-0">
                  <div className="font-display text-[17px] font-bold leading-tight text-ss-ink">
                    {PLAN_NAME}
                  </div>
                  <p className="mt-1.5 text-[12px] leading-none text-ss-muted">
                    {PLAN_TAGLINE}
                  </p>
                </div>
                <div className="ml-auto text-right">
                  <div className="ss-num text-[26px] leading-none text-ss-ink">
                    {money(PRICING.monthly)}
                  </div>
                  <div className="mt-1.5 text-[11.5px] font-medium leading-none text-ss-muted">
                    per month
                  </div>
                </div>
              </div>

              <div className="my-5 h-px bg-ss-hair" aria-hidden="true" />

              <div className="ss-eyebrow tracking-[0.08em] text-ss-muted">
                What you&apos;re using right now
              </div>
              <div className="mt-3.5 grid gap-3.5 sm:grid-cols-3">
                <Usage
                  value={num(workspace?.counts.chatbots ?? 0)}
                  label="chatbots"
                  note="unlimited"
                />
                <Usage
                  value={num(repliesThisMonth ?? 0)}
                  label="AI replies this month"
                  note="unlimited"
                />
                <Usage
                  value={`${channelsConnected} of 5`}
                  label="channels connected"
                  note="through ManyChat"
                />
              </div>

              <div className="my-5 h-px bg-ss-hair" aria-hidden="true" />

              <div className="ss-eyebrow tracking-[0.08em] text-ss-muted">
                {active ? "Included" : "What you'll get"}
              </div>
              <ul className="mt-3.5 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                {PLAN_FEATURES.map((f) => (
                  <li key={f} className="flex gap-2.5 text-[12.5px] leading-snug text-ss-ink">
                    <Check className="mt-px h-4 w-4 shrink-0 text-ss-green" aria-hidden="true" />
                    {f}
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {offerCheckout ? (
                  <BillingButtons hasSubscription={hasCustomer} />
                ) : (
                  <p className="text-[12.5px] leading-relaxed text-ss-muted">
                    Your access is already active and isn&apos;t billed through
                    Stripe, so there&apos;s nothing to buy here. Ask the team on{" "}
                    <Link href="/feedback" className="font-semibold text-ss-indigo-600 underline">
                      Feedback
                    </Link>{" "}
                    to change it.
                  </p>
                )}
              </div>
            </div>
          </SsCard>

          <div className="flex flex-col gap-4">
            <NavyPanel className="px-[22px] py-5">
              <PanelEyebrow
                icon={<PiggyBank className="h-3.5 w-3.5 text-ss-mint" />}
              >
                Switch to yearly
              </PanelEyebrow>
              <div className="mt-3.5 flex items-baseline gap-2">
                <span className="ss-num text-[32px] leading-none text-white">
                  {money(PRICING.annualPerMonth)}
                </span>
                <span className="text-[13px] font-medium leading-none text-ss-nav-text">
                  /mo
                </span>
              </div>
              <p className="mt-2.5 text-[12.5px] leading-relaxed text-ss-nav-text">
                Billed {money(PRICING.annualTotal)} once a year instead of{" "}
                {money(PRICING.monthly * 12)} monthly.
              </p>
              <div className="mt-3.5 rounded-chip border border-ss-mint/30 bg-ss-mint/15 px-3.5 py-3">
                <div className="font-display text-[13px] font-bold leading-none text-ss-mint">
                  You keep {money(PRICING.annualSavings)} a year
                </div>
                <p className="mt-1.5 text-[11.5px] leading-snug text-ss-mint-text">
                  Same features. Switching mid-cycle prorates what you&apos;ve
                  already paid.
                </p>
              </div>
              <div className="mt-4">
                {offerCheckout ? (
                  <BillingButtons hasSubscription={hasCustomer} annual />
                ) : (
                  <p className="text-[12px] leading-relaxed text-ss-nav-text">
                    Not billed through Stripe, so this can&apos;t be switched
                    from here.
                  </p>
                )}
              </div>
            </NavyPanel>

            <SsCard className="p-5">
              <SsCardHead title="Billed to" />
              <div className="mt-3 flex flex-col gap-1.5 text-[12.5px] leading-relaxed text-ss-body">
                <span className="font-semibold text-ss-ink">
                  {workspace?.fullName ?? "-"}
                </span>
                <span>{workspace?.email ?? user?.email ?? "-"}</span>
              </div>
              <p className="mt-3.5 border-t border-ss-hair pt-3 text-[11.5px] leading-relaxed text-ss-muted">
                Edit your name on{" "}
                <a href="/settings" className="font-semibold text-ss-indigo-600">
                  Settings
                </a>
                . Invoices and tax details live in the Stripe billing portal.
              </p>
            </SsCard>
          </div>
        </div>

        {/* ---- Cancellation + trust ------------------------------------ */}
        <Callout
          tone="plain"
          icon={<Info className="h-[18px] w-[18px] text-ss-muted" aria-hidden="true" />}
        >
          Cancelling stops future charges and keeps your bots running until
          {renews ? ` ${shortDate(renews)}` : " the end of the period"}. Manage or
          cancel it any time from the billing portal.
        </Callout>

        <div className="flex items-center justify-center gap-2 text-[11.5px] leading-none text-ss-muted">
          <ShieldCheck className="h-4 w-4 shrink-0 text-ss-green" aria-hidden="true" />
          Payments processed by Stripe - card details never touch SpeedSettr.
        </div>
      </PageBody>
    </PageShell>
  );
}

function Usage({
  value,
  label,
  note,
}: {
  value: string;
  label: string;
  note: string;
}) {
  return (
    <div className="rounded-chip bg-ss-soft px-3.5 py-3">
      <div className="ss-num text-xl leading-none text-ss-ink">{value}</div>
      <div className="mt-1.5 text-[11.5px] leading-snug text-ss-muted">
        {label}
        <br />
        {note}
      </div>
    </div>
  );
}
