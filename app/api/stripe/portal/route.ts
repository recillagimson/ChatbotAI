import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getImpersonation } from "@/lib/impersonation";
import { getStripe, getAppUrl } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  // An admin "viewing as" a client must not open the client's billing portal.
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

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!sub?.stripe_customer_id) {
    return NextResponse.json({ error: "no_subscription" }, { status: 400 });
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${getAppUrl()}/billing`,
  });

  return NextResponse.json({ url: portal.url });
}
