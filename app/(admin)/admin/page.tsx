import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Subscription } from "@/lib/types";
import { hasActiveAccess, isComp, type AccessRow } from "@/lib/access";
import { num } from "@/lib/format";
import { PageBody, PageHeader, PageShell } from "@/components/ss/page";
import { NavyPanel, PanelEyebrow } from "@/components/ss/panel";
import { StatBlock } from "@/components/ss/stat";
import {
  AdminClientsBrowser,
  type AdminClientRow,
} from "@/components/admin/admin-clients-browser";

export default async function AdminClientsPage() {
  const supabase = await createClient();

  const [{ data: profiles }, { data: subscriptions }, { data: chatbots }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, email, full_name, company_name, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("subscriptions")
        .select("user_id, status, comp_expires_at, stripe_subscription_id"),
      supabase.from("chatbots").select("user_id"),
    ]);

  const profileRows = (profiles ?? []) as Pick<
    Profile,
    "id" | "email" | "full_name" | "company_name" | "created_at"
  >[];

  const subByUser = new Map<string, AccessRow>();
  for (const s of (subscriptions ?? []) as (AccessRow & { user_id: string })[]) {
    subByUser.set(s.user_id, {
      status: s.status,
      comp_expires_at: s.comp_expires_at,
      stripe_subscription_id: s.stripe_subscription_id,
    });
  }

  const countByUser = new Map<string, number>();
  for (const c of (chatbots ?? []) as { user_id: string }[]) {
    countByUser.set(c.user_id, (countByUser.get(c.user_id) ?? 0) + 1);
  }

  const clients: AdminClientRow[] = profileRows.map((profile) => ({
    id: profile.id,
    name: profile.full_name || profile.email,
    email: profile.email,
    company: profile.company_name,
    createdAt: profile.created_at,
    chatbotCount: countByUser.get(profile.id) ?? 0,
    access: subByUser.get(profile.id) ?? null,
  }));

  // Overview metrics, all derived from the rows already loaded - no extra query.
  // "With access" reuses hasActiveAccess so a lapsed comp is never counted as
  // live; "Comped" is the live-comp subset of that.
  const total = clients.length;
  const withAccess = clients.filter((c) => hasActiveAccess(c.access)).length;
  const comped = clients.filter(
    (c) => isComp(c.access) && hasActiveAccess(c.access)
  ).length;
  const totalChatbots = clients.reduce((n, c) => n + c.chatbotCount, 0);

  return (
    <PageShell>
      <PageHeader
        title="Clients"
        description="Every account, their access, and their chatbots."
      />
      <PageBody>
        {/* ---- Overview hero -------------------------------------------- */}
        <NavyPanel className="rounded-card px-[22px] py-5">
          <PanelEyebrow icon={<Users className="h-3.5 w-3.5" />}>
            Overview
          </PanelEyebrow>
          <div className="mt-[18px] flex flex-wrap gap-x-10 gap-y-5">
            <StatBlock
              dark
              label="Clients"
              value={num(total)}
              suffix={total === 1 ? "account" : "accounts"}
            />
            <StatBlock dark label="With access" value={num(withAccess)} suffix="live now" />
            <StatBlock
              dark
              label="Comped"
              value={num(comped)}
              suffix={comped === 1 ? "grant" : "grants"}
            />
            <StatBlock dark label="Chatbots" value={num(totalChatbots)} suffix="in total" />
          </div>
        </NavyPanel>

        {/* ---- Browsable client list ------------------------------------ */}
        <AdminClientsBrowser clients={clients} />
      </PageBody>
    </PageShell>
  );
}
