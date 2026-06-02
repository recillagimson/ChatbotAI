import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { upsertSubscriptionRow } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const stripe = getStripe();
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

  async function upsertSubscription(sub: Stripe.Subscription) {
    const userId =
      (sub.metadata?.supabase_user_id as string | undefined) ||
      (await findUserIdByCustomer(sub.customer as string));
    if (!userId) {
      console.warn("[stripe-webhook] no userId for subscription", sub.id);
      return;
    }
    await upsertSubscriptionRow(sub, userId);
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
