import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Paperclip } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AdminChatbotEditForm } from "@/components/admin/admin-chatbot-edit-form";
import { ViewAsButton } from "@/components/admin/view-as-button";
import { GrantAccessForm } from "@/components/admin/grant-access-form";
import { KnowledgeBaseForm } from "@/components/dashboard/kb-form";
import { KnowledgeBaseList } from "@/components/dashboard/kb-list";
import { RetrainBotButton } from "@/components/dashboard/retrain-bot-button";
import { ModelControls } from "@/components/dashboard/model-controls";
import { cn } from "@/lib/utils";
import { PageBody, PageHeader, PageShell, EmptyState } from "@/components/ss/page";
import { SsCard, SsCardHead } from "@/components/ss/card";
import { SsChip, SsLinkButton, SsStatus } from "@/components/ss/controls";
import { StatCard } from "@/components/ss/stat";
import { num } from "@/lib/format";
import { hasActiveAccess, isComp } from "@/lib/access";
import type {
  Profile,
  Subscription,
  Chatbot,
  ChangeRequest,
  Feedback,
} from "@/lib/types";

type SubStatus = Subscription["status"];

function subBadge(status: SubStatus | null) {
  switch (status) {
    case "active":
      return <SsStatus tone="green">Active</SsStatus>;
    case "trialing":
      return <SsStatus tone="indigo">Trialing</SsStatus>;
    case "past_due":
      return <SsStatus tone="amber">Past due</SsStatus>;
    case "canceled":
      return <SsChip tone="neutral">Canceled</SsChip>;
    case "incomplete":
      return <SsStatus tone="rose">Incomplete</SsStatus>;
    default:
      return <SsChip tone="neutral">No sub</SsChip>;
  }
}

function crBadge(status: ChangeRequest["status"]) {
  switch (status) {
    case "pending":
      return <SsStatus tone="amber">Pending</SsStatus>;
    case "approved":
      return <SsStatus tone="indigo">Approved</SsStatus>;
    case "applied":
      return <SsStatus tone="green">Applied</SsStatus>;
    case "rejected":
      return <SsStatus tone="rose">Rejected</SsStatus>;
  }
}

function feedbackBadge(status: Feedback["status"]) {
  switch (status) {
    case "new":
      return <SsStatus tone="indigo">New</SsStatus>;
    case "read":
      return <SsChip tone="neutral">Read</SsChip>;
    case "resolved":
      return <SsStatus tone="green">Resolved</SsStatus>;
  }
}

const SECTION_HEADING = "font-display text-[17px] font-bold leading-tight text-ss-ink";

type AdminChatbot = Pick<
  Chatbot,
  | "id"
  | "name"
  | "business_description"
  | "tone"
  | "system_prompt"
  | "persona_section"
  | "offers_section"
  | "rebuttals_section"
  | "instagram_username"
  | "is_active"
  | "created_at"
  | "reply_model"
  | "force_retrieval"
>;

// Matches KnowledgeBaseList's Entry shape (its type is component-local).
type AdminKbEntry = {
  id: string;
  chatbot_id: string;
  title: string;
  content: string;
  source_type: string;
  created_at: string;
  chatbots: { name: string } | null;
  indexed?: boolean;
  needs_review?: boolean;
};

export default async function AdminClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ bot?: string }>;
}) {
  const { id } = await params;
  const { bot: activeBotParam } = await searchParams;
  const supabase = await createClient();

  const { data: profileData } = await supabase
    .from("profiles")
    .select("id, email, full_name, company_name, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!profileData) notFound();

  const profile = profileData as Pick<
    Profile,
    "id" | "email" | "full_name" | "company_name" | "created_at"
  >;

  const [
    { data: subData },
    { data: chatbotsData },
    { data: requestsData },
    { data: feedbackData },
    { data: kbData },
  ] = await Promise.all([
    supabase
      .from("subscriptions")
      .select(
        "status, current_period_end, stripe_subscription_id, comp_expires_at, comp_granted_at, comp_note"
      )
      .eq("user_id", id)
      .maybeSingle(),
    supabase
      .from("chatbots")
      .select(
        "id, name, business_description, tone, system_prompt, persona_section, offers_section, rebuttals_section, instagram_username, is_active, created_at, reply_model, force_retrieval"
      )
      .eq("user_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("change_requests")
      .select("*")
      .eq("user_id", id)
      .neq("status", "draft")
      .order("created_at", { ascending: false }),
    supabase
      .from("feedback")
      .select("*")
      .eq("user_id", id)
      .order("created_at", { ascending: false }),
    // KB entries for this client (superadmin reads them via the "admin all kb" RLS overlay).
    supabase
      .from("knowledge_base")
      .select(
        "id, chatbot_id, title, content, source_type, created_at, indexed, needs_review, chatbots(name)"
      )
      .eq("user_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const subscription = subData as Pick<
    Subscription,
    | "status"
    | "current_period_end"
    | "stripe_subscription_id"
    | "comp_expires_at"
    | "comp_granted_at"
    | "comp_note"
  > | null;

  // Access state for the grant card. A paid client (active Stripe sub, no comp)
  // needs no comp; everyone else can be granted/extended/revoked.
  const accessActive = hasActiveAccess(subscription);
  const compRow = isComp(subscription);
  const paidActive = accessActive && !compRow;
  const paidRenews = subscription?.current_period_end
    ? new Date(subscription.current_period_end)
    : null;
  const chatbots = (chatbotsData ?? []) as AdminChatbot[];
  // Which chatbot's card is shown. With more than one bot they're split into tabs
  // (?bot=<id> links); default to the first. A stale/unknown id falls back to the first.
  const activeBot =
    chatbots.find((b) => b.id === activeBotParam) ?? chatbots[0] ?? null;
  const requests = (requestsData ?? []) as ChangeRequest[];
  const feedback = (feedbackData ?? []) as Feedback[];

  // KB entries grouped by chatbot, so each chatbot card shows only its own. The chatbots(name)
  // embed is a to-one object at runtime, but the untyped client infers an array type, so
  // normalize defensively before handing entries to KnowledgeBaseList.
  const kbByChatbot = new Map<string, AdminKbEntry[]>();
  for (const row of (kbData ?? []) as unknown as Array<
    Omit<AdminKbEntry, "chatbots"> & {
      chatbots: { name: string } | { name: string }[] | null;
    }
  >) {
    const chatbots = Array.isArray(row.chatbots) ? row.chatbots[0] ?? null : row.chatbots;
    const entry: AdminKbEntry = { ...row, chatbots };
    const list = kbByChatbot.get(entry.chatbot_id) ?? [];
    list.push(entry);
    kbByChatbot.set(entry.chatbot_id, list);
  }

  const openRequests = requests.filter((r) => r.status === "pending").length;

  // The subscription/comp badge shown in the header, mirroring the access state.
  const subStatus = compRow ? (
    accessActive ? (
      <SsStatus tone="green">Comp</SsStatus>
    ) : (
      <SsChip tone="neutral">Comp expired</SsChip>
    )
  ) : (
    subBadge(subscription?.status ?? null)
  );

  return (
    <PageShell>
      <PageHeader
        title={profile.full_name || profile.email}
        description={
          <>
            {profile.email}
            {profile.company_name ? <> &middot; {profile.company_name}</> : null}{" "}
            &middot; Joined{" "}
            {new Date(profile.created_at).toLocaleDateString()}
          </>
        }
        leading={
          <Link
            href="/admin"
            className="mb-1 flex w-full items-center gap-1.5 text-[12px] font-semibold leading-none text-ss-muted transition-colors hover:text-ss-ink"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            All clients
          </Link>
        }
        actions={
          <>
            {subStatus}
            <ViewAsButton
              clientId={profile.id}
              label="Open client dashboard"
              variant="button"
            />
          </>
        }
      />

      <PageBody>
        {/* Snapshot counters, replacing the old identity aside's stat trio. */}
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Chatbots" value={num(chatbots.length)} />
          <StatCard
            label="Open requests"
            value={num(openRequests)}
            valueTone={openRequests > 0 ? "amber" : "ink"}
          />
          <StatCard label="Feedback" value={num(feedback.length)} />
        </div>

        {/* ---- Access ---------------------------------------------------- */}
        <section>
          <h2 className={SECTION_HEADING}>Access</h2>
          <div className="mt-3">
            {paidActive ? (
              <SsCard tone="soft" className="px-5 py-4">
                <p className="text-[13px] font-semibold text-ss-ink">
                  Active paid subscription
                </p>
                <p className="mt-1 text-[12.5px] leading-snug text-ss-muted">
                  {paidRenews
                    ? `Renews on ${paidRenews.toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}.`
                    : "Managed by Stripe."}{" "}
                  No comp needed.
                </p>
              </SsCard>
            ) : (
              <SsCard className="p-[22px]">
                <GrantAccessForm
                  userId={profile.id}
                  compExpiresAt={subscription?.comp_expires_at ?? null}
                  compNote={subscription?.comp_note ?? null}
                />
              </SsCard>
            )}
          </div>
        </section>

        {/* ---- Chatbots ------------------------------------------------- */}
        <section>
          <h2 className={SECTION_HEADING}>Chatbots ({chatbots.length})</h2>
          {chatbots.length === 0 || !activeBot ? (
            <div className="mt-3">
              <EmptyState variant="inline" title="No chatbots yet">
                This client has no chatbots yet.
              </EmptyState>
            </div>
          ) : (
            <>
              {/* Tabs - one per bot when the client has more than one, so their cards
                  don't stack into a wall. Server-driven via ?bot=<id> (deep-linkable);
                  scroll={false} keeps the page from jumping to the top on switch. */}
              {chatbots.length > 1 && (
                <div
                  className="mt-3 flex flex-wrap gap-2"
                  role="tablist"
                  aria-label="Chatbots"
                >
                  {chatbots.map((b) => {
                    const active = b.id === activeBot.id;
                    return (
                      <Link
                        key={b.id}
                        href={`/admin/clients/${id}?bot=${b.id}`}
                        scroll={false}
                        role="tab"
                        aria-selected={active}
                        className={cn(
                          "inline-flex items-center rounded-full border px-3.5 py-2 text-[12.5px] font-semibold leading-none transition-colors",
                          active
                            ? "border-ss-indigo-200 bg-ss-indigo-25 text-ss-indigo-700"
                            : "border-ss-line bg-white text-ss-muted hover:border-ss-dash hover:text-ss-ink"
                        )}
                      >
                        {b.name}
                      </Link>
                    );
                  })}
                </div>
              )}

              <div className="mt-3">
                <SsCard key={activeBot.id} className="p-[22px]">
                  <SsCardHead
                    titleAs="h3"
                    title={activeBot.name}
                    action={
                      activeBot.is_active ? (
                        <SsStatus tone="green">Active</SsStatus>
                      ) : (
                        <SsChip tone="neutral">Paused</SsChip>
                      )
                    }
                  />

                  <div className="mt-5">
                    <AdminChatbotEditForm
                      chatbot={{
                        id: activeBot.id,
                        name: activeBot.name,
                        instagram_username: activeBot.instagram_username,
                        is_active: activeBot.is_active,
                        persona_section: activeBot.persona_section,
                        offers_section: activeBot.offers_section,
                        rebuttals_section: activeBot.rebuttals_section,
                        system_prompt: activeBot.system_prompt,
                        business_description: activeBot.business_description,
                      }}
                    />
                  </div>

                  {/* Admin cost controls: per-bot reply model + force KB retrieval. Both are
                      superadmin-only (RLS "admin all chatbots" + the admin-only column trigger),
                      so the write goes through the admin's own client here - no "view as" needed. */}
                  <div className="mt-6">
                    <ModelControls
                      chatbotId={activeBot.id}
                      initialReplyModel={activeBot.reply_model}
                      initialForceRetrieval={activeBot.force_retrieval}
                    />
                  </div>

                  {/* Knowledge base for this chatbot. Uploads/edits post to the KB
                      routes, which stamp this client as owner (not the admin); deletes
                      go through RLS via the "admin all kb" overlay. */}
                  <div className="mt-6 border-t border-ss-hair pt-6">
                    <h3 className="font-display text-[14px] font-bold leading-tight text-ss-ink">
                      Knowledge base
                    </h3>
                    <p className="mb-4 mt-1 text-xs leading-snug text-ss-muted">
                      Upload or paste knowledge for this chatbot. Files are parsed and
                      indexed for retrieval, exactly as on the client&apos;s own dashboard.
                    </p>
                    <KnowledgeBaseForm chatbotId={activeBot.id} />
                    <div className="mt-6 space-y-3">
                      <p className="text-[13px] font-semibold text-ss-ink">
                        {(kbByChatbot.get(activeBot.id) ?? []).length} entr
                        {(kbByChatbot.get(activeBot.id) ?? []).length === 1 ? "y" : "ies"}
                      </p>
                      <KnowledgeBaseList entries={kbByChatbot.get(activeBot.id) ?? []} />
                    </div>

                    {/* Retrain: rebuild the vector index (re-embed every KB entry) + clear
                        the short-lived reply caches so edits made here take effect right
                        away. Reuses the client dashboard's button; the reindex route now
                        authorizes superadmins directly (no "view as" needed). */}
                    <div className="mt-5 border-t border-ss-hair pt-4">
                      <p className="mb-2.5 text-xs leading-snug text-ss-muted">
                        After editing this bot&apos;s knowledge base, retrain to rebuild the
                        search index so replies use the latest content.
                      </p>
                      <RetrainBotButton chatbotId={activeBot.id} variant="outline" size="sm" />
                    </div>
                  </div>
                </SsCard>
              </div>
            </>
          )}
        </section>

        {/* ---- Change requests ------------------------------------------ */}
        <section>
          <h2 className={SECTION_HEADING}>Change requests ({requests.length})</h2>
          {requests.length === 0 ? (
            <div className="mt-3">
              <EmptyState variant="inline" title="No change requests" />
            </div>
          ) : (
            <SsCard className="mt-3 divide-y divide-ss-hair">
              {requests.map((cr) => (
                <div
                  key={cr.id}
                  className="flex items-start justify-between gap-4 p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {crBadge(cr.status)}
                      <span className="text-[11.5px] leading-none text-ss-muted tabular-nums">
                        {new Date(cr.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-ss-body">
                      {cr.request_text}
                    </p>
                  </div>
                  <SsLinkButton
                    href={`/admin/requests/${cr.id}`}
                    variant="outline"
                    size="sm"
                  >
                    Review
                  </SsLinkButton>
                </div>
              ))}
            </SsCard>
          )}
        </section>

        {/* ---- Feedback ------------------------------------------------- */}
        <section>
          <h2 className={SECTION_HEADING}>Feedback ({feedback.length})</h2>
          {feedback.length === 0 ? (
            <div className="mt-3">
              <EmptyState variant="inline" title="No feedback" />
            </div>
          ) : (
            <SsCard className="mt-3 divide-y divide-ss-hair">
              {feedback.map((fb) => (
                <div key={fb.id} className="p-4">
                  <div className="flex items-center gap-2">
                    {feedbackBadge(fb.status)}
                    <span className="text-[11.5px] leading-none text-ss-muted tabular-nums">
                      {new Date(fb.created_at).toLocaleDateString()}
                    </span>
                    {fb.attachments?.length ? (
                      <span className="inline-flex items-center gap-1 text-[11.5px] leading-none text-ss-muted">
                        <Paperclip className="h-3 w-3" aria-hidden="true" />
                        {fb.attachments.length}{" "}
                        {fb.attachments.length === 1 ? "file" : "files"}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-ss-body">
                    {fb.message}
                  </p>
                </div>
              ))}
            </SsCard>
          )}
        </section>
      </PageBody>
    </PageShell>
  );
}
