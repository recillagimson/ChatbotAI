import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSuperadmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";
import { computeExpiry } from "@/lib/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  userId: z.string().uuid(),
  action: z.enum(["grant", "extend", "revoke"]),
  days: z.number().int().min(0).max(3650).optional(),
  months: z.number().int().min(0).max(120).optional(),
  note: z.string().trim().max(500).optional(),
});

/**
 * POST /api/admin/grant-access - superadmin comp-access control.
 * grant : set status='trialing', comp_expires_at = now + duration (fresh).
 * extend: comp_expires_at = max(now, current expiry) + duration.
 * revoke: status='canceled', comp_expires_at = now (access ends immediately).
 *
 * Superadmin-only (requireSuperadmin resolves the REAL admin, not an
 * impersonated client). Writes via the service role - the sanctioned pattern
 * for an authorized cross-user privileged write (RLS blocks a normal client from
 * writing another user's subscription row). Refuses to comp over a live paid
 * Stripe subscription.
 */
export async function POST(request: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { userId, action, days = 0, months = 0, note } = parsed.data;

  const supabase = createServiceClient();
  const now = new Date();
  const nowIso = now.toISOString();

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("status, comp_expires_at, stripe_subscription_id")
    .eq("user_id", userId)
    .maybeSingle();

  // Safety rail (applies to ALL actions): never touch a REAL Stripe subscription
  // row. That means a row with a Stripe subscription id, no comp, in a status
  // Stripe actively manages - active/trialing (paying) or past_due (dunning; the
  // customer may still recover). grant/extend would clobber the real sub; revoke
  // would mutate it until Stripe re-syncs. Canceled/incomplete rows carry a
  // Stripe id too but are dead, so they stay comp-eligible (win back a churned
  // customer). The admin UI never offers these on a live sub (it shows a
  // read-only "Active paid subscription" card) - this guards direct API calls.
  const liveStripeSub =
    !!existing?.stripe_subscription_id &&
    !existing?.comp_expires_at &&
    (existing.status === "active" ||
      existing.status === "trialing" ||
      existing.status === "past_due");
  if (liveStripeSub) {
    return NextResponse.json({ error: "has_paid_subscription" }, { status: 409 });
  }

  if (action === "revoke") {
    const { error } = await supabase
      .from("subscriptions")
      .update({ status: "canceled", comp_expires_at: nowIso, updated_at: nowIso })
      .eq("user_id", userId);
    if (error) return NextResponse.json({ error: "Could not revoke access." }, { status: 500 });
    return NextResponse.json({ ok: true, action, comp_expires_at: nowIso });
  }

  // grant | extend both need a positive duration.
  if (days <= 0 && months <= 0) {
    return NextResponse.json({ error: "Choose a duration." }, { status: 400 });
  }

  // extend stacks onto the later of now / the current comp expiry; grant is fresh from now.
  const base =
    action === "extend" && existing?.comp_expires_at && new Date(existing.comp_expires_at) > now
      ? new Date(existing.comp_expires_at)
      : now;
  const expiryIso = computeExpiry(base, { days, months }).toISOString();

  // Upsert the one row per user. Null the Stripe subscription fields so a comp
  // row is unambiguous (isComp() checks for the absence of a Stripe sub id);
  // keep stripe_customer_id untouched (harmless, preserves any customer link).
  const { error } = await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      status: "trialing",
      stripe_subscription_id: null,
      stripe_price_id: null,
      current_period_end: null,
      cancel_at_period_end: false,
      comp_expires_at: expiryIso,
      comp_granted_at: nowIso,
      comp_granted_by: admin.id,
      comp_note: note ?? null,
      updated_at: nowIso,
    },
    { onConflict: "user_id" }
  );
  if (error) return NextResponse.json({ error: "Could not grant access." }, { status: 500 });
  return NextResponse.json({ ok: true, action, comp_expires_at: expiryIso });
}
