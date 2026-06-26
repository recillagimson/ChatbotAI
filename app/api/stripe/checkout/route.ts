import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getImpersonation } from "@/lib/impersonation";
import { getStripe, priceIdForCycle, getAppUrl } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // An admin "viewing as" a client must not start a Stripe flow.
  if ((await getImpersonation()).active) {
    return NextResponse.json({ error: "Billing is disabled while viewing as a client." }, { status: 400 });
  }

  const stripe = getStripe();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Billing cycle (defaults to monthly if no/invalid body).
  let cycle: "monthly" | "annual" = "monthly";
  try {
    const body = await req.json();
    if (body?.cycle === "annual") cycle = "annual";
  } catch {
    /* no JSON body → monthly */
  }
  const price = priceIdForCycle(cycle);
  if (!price) {
    return NextResponse.json(
      { error: `No Stripe price configured for ${cycle} billing.` },
      { status: 500 }
    );
  }

  // Re-use stripe customer if we already created one
  const { data: existing } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  let customerId = existing?.stripe_customer_id ?? undefined;
  if (!customerId) {
    // Reuse an existing Stripe customer for this user before creating a new one.
    // Without this, a not-yet-synced subscription row meant every checkout made
    // a brand-new customer, leaving orphaned duplicates in Stripe.
    const found = await stripe.customers.list({ email: user.email!, limit: 100 });
    customerId = found.data.find(
      (c) => c.metadata?.supabase_user_id === user.id
    )?.id;
  }
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email!,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    success_url: `${getAppUrl()}/billing?status=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${getAppUrl()}/billing?status=cancelled`,
    metadata: { supabase_user_id: user.id, cycle },
    subscription_data: {
      metadata: { supabase_user_id: user.id, cycle },
    },
  });

  return NextResponse.json({ url: session.url });
}
