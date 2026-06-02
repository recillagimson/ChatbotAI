import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BillingButtons } from "@/components/dashboard/billing-buttons";
import { reconcileFromCheckoutSession } from "@/lib/billing";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; session_id?: string }>;
}) {
  const { status, session_id } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  const active =
    subscription?.status === "active" || subscription?.status === "trialing";

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Billing</h1>
        <p className="text-muted-foreground">
          Manage your subscription and payment method.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Professional Plan</CardTitle>
              <CardDescription>$349 / month · cancel anytime</CardDescription>
            </div>
            <Badge variant={active ? "success" : "secondary"}>
              {subscription?.status ?? "No subscription"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="text-sm space-y-1 mb-6 text-muted-foreground">
            <li>· Unlimited AI replies on Instagram & Messenger</li>
            <li>· Custom knowledge base & training</li>
            <li>· Conversation inbox with manual takeover</li>
            <li>· Multiple chatbots & accounts</li>
            <li>· Priority email support</li>
          </ul>

          {subscription?.current_period_end && (
            <p className="text-sm mb-4">
              {subscription.cancel_at_period_end
                ? "Cancels on "
                : "Renews on "}
              <b>
                {new Date(subscription.current_period_end).toLocaleDateString()}
              </b>
            </p>
          )}

          <BillingButtons hasSubscription={!!subscription?.stripe_customer_id} />
        </CardContent>
      </Card>
    </div>
  );
}
