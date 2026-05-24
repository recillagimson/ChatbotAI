import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const sig = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    console.error("[stripe-webhook] bad signature", err);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const supabase = createServiceClient();

  async function upsertSubscription(sub: Stripe.Subscription) {
    const userId =
      (sub.metadata?.supabase_user_id as string | undefined) ||
      (await findUserIdByCustomer(sub.customer as string));
    if (!userId) {
      console.warn("[stripe-webhook] no userId for subscription", sub.id);
      return;
    }

    await supabase.from("subscriptions").upsert(
      {
        user_id: userId,
        stripe_customer_id: sub.customer as string,
        stripe_subscription_id: sub.id,
        stripe_price_id: sub.items.data[0]?.price.id ?? null,
        status: sub.status,
        current_period_end: new Date(
          sub.current_period_end * 1000
        ).toISOString(),
        cancel_at_period_end: sub.cancel_at_period_end,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  }

  async function findUserIdByCustomer(
    customerId: string
  ): Promise<string | null> {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return null;
    return (
      (customer.metadata?.supabase_user_id as string | undefined) ?? null
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(
            session.subscription as string
          );
          await upsertSubscription(sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await upsertSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      default:
        // ignore other events
        break;
    }
  } catch (err) {
    console.error("[stripe-webhook] handler error", err);
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
