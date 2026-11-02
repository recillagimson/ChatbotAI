import { PhoneCall } from "lucide-react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { contactDisplayName, contactHandle } from "@/lib/contact";
import { agoShort } from "@/lib/format";
import { PageBody, PageHeader, PageShell, Callout, EmptyState } from "@/components/ss/page";
import { SsPill } from "@/components/ss/controls";
import { LeadCard, type LeadItem, type LeadRemark } from "@/components/dashboard/lead-card";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABEL,
  leadStatusOf,
  parseStatusFilter,
} from "@/lib/lead-status";

export const dynamic = "force-dynamic";

/** Most leads one tab lists; the tab counts stay exact past it. */
const LEAD_PAGE = 300;

type Row = {
  id: string;
  contact_name: string | null;
  contact_username: string | null;
  platform: string | null;
  lead_phone: string | null;
  lead_email: string | null;
  lead_contact_at: string;
  lead_status: string | null;
  chatbots: { name: string | null } | { name: string | null }[] | null;
};

/**
 * Lead contacts - every lead who sent this account's bots a phone number or email
 * (saved by the webhook, lib/lead-contact.ts), with a follow-up status and a log of
 * updates the team posts. Scoped to the effective user (getCurrentUser), so a client
 * sees only their own leads and an admin sees a client's under "View as client".
 */
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const filter = parseStatusFilter(sp.status);
  const supabase = await createClient();
  const user = await getCurrentUser();

  // The newest LEAD_PAGE leads for this tab, filtered in the database, plus an
  // exact count per tab from head queries (no rows on the wire).
  const base = () =>
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user!.id)
      .not("lead_contact_at", "is", null);
  const PENDING = "lead_status.is.null,lead_status.eq.pending";
  const [listRes, ...countRes] = await Promise.all([
    (() => {
      let q = supabase
        .from("conversations")
        .select(
          "id, contact_name, contact_username, platform, lead_phone, lead_email, lead_contact_at, lead_status, chatbots(name)"
        )
        .eq("user_id", user!.id)
        .not("lead_contact_at", "is", null)
        .order("lead_contact_at", { ascending: false })
        .limit(LEAD_PAGE);
      if (filter === "pending") q = q.or(PENDING);
      else if (filter !== "all") q = q.eq("lead_status", filter);
      return q.returns<Row[]>();
    })(),
    base(),
    ...LEAD_STATUSES.map((st) => (st === "pending" ? base().or(PENDING) : base().eq("lead_status", st))),
  ]);
  if (listRes.error) console.error("[leads] list failed", listRes.error);
  const rows = listRes.data ?? [];
  const counts = Object.fromEntries(
    (["all", ...LEAD_STATUSES] as const).map((k, i) => [k, countRes[i]?.count ?? 0])
  ) as Record<"all" | (typeof LEAD_STATUSES)[number], number>;

  // Remarks only for the leads on screen, in chunks that keep the URL short.
  const ids = rows.map((r) => r.id);
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
  const remarkPages = await Promise.all(
    chunks.map((chunk) =>
      supabase
        .from("lead_remarks")
        .select("id, conversation_id, kind, body, author_email, created_at")
        .in("conversation_id", chunk)
        .order("created_at", { ascending: false })
        .limit(2000)
        .returns<(LeadRemark & { conversation_id: string })[]>()
    )
  );
  const now = Date.now();
  const remarksByLead = new Map<string, LeadRemark[]>();
  for (const page of remarkPages) {
    if (page.error) console.error("[leads] remarks failed", page.error);
    for (const r of page.data ?? []) {
      const list = remarksByLead.get(r.conversation_id) ?? [];
      list.push({ ...r, ago: agoShort(r.created_at, now) });
      remarksByLead.set(r.conversation_id, list);
    }
  }

  const leads: LeadItem[] = rows.map((r) => {
    const bot = Array.isArray(r.chatbots) ? r.chatbots[0] : r.chatbots;
    return {
      id: r.id,
      name: contactDisplayName(r.contact_name, r.contact_username),
      handle: contactHandle(r.contact_username),
      botName: bot?.name ?? null,
      platform: r.platform,
      phone: r.lead_phone,
      email: r.lead_email,
      sharedAt: r.lead_contact_at,
      sharedAgo: agoShort(r.lead_contact_at, now),
      status: leadStatusOf(r.lead_status),
      remarks: remarksByLead.get(r.id) ?? [],
    };
  });

  const tabs: { key: "all" | (typeof LEAD_STATUSES)[number]; label: string }[] = [
    { key: "all", label: "All" },
    ...LEAD_STATUSES.map((s) => ({ key: s, label: LEAD_STATUS_LABEL[s] })),
  ];

  return (
    <PageShell>
      <PageHeader
        title="Lead contacts"
        description="Leads who sent your bot a phone number or email. Set where each one stands and post updates so everyone knows the latest."
        below={
          <div className="-mb-px flex flex-wrap gap-2 pb-3 pt-4">
            {tabs.map((t) => (
              <SsPill
                key={t.key}
                href={t.key === "all" ? "/leads" : `/leads?status=${t.key}`}
                active={filter === t.key}
                count={counts[t.key]}
              >
                {t.label}
              </SsPill>
            ))}
          </div>
        }
      />
      <PageBody>
        {listRes.error ? (
          <Callout tone="rose" title="Couldn't load your lead contacts">
            Refresh the page. If this keeps happening, contact support.
          </Callout>
        ) : leads.length === 0 ? (
          <EmptyState icon={<PhoneCall className="h-6 w-6" aria-hidden="true" />} title={
            filter === "all" ? "No lead contacts yet" : `No leads marked ${LEAD_STATUS_LABEL[filter]}`
          }>
            {filter === "all"
              ? "When a lead sends your bot a phone number or email, they show up here."
              : "Pick another tab to see the rest."}
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-2.5">
            {leads.map((lead) => (
              <LeadCard key={lead.id} lead={lead} />
            ))}
            {counts[filter] > leads.length ? (
              <p className="text-center text-[12.5px] text-ss-muted">
                Showing the newest {leads.length} of {counts[filter]}.
              </p>
            ) : null}
          </div>
        )}
      </PageBody>
    </PageShell>
  );
}
