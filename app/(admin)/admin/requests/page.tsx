import { Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageBody, PageHeader, PageShell, EmptyState } from "@/components/ss/page";
import { SsCard } from "@/components/ss/card";
import { SsChip, SsLinkButton, SsPill, SsStatus } from "@/components/ss/controls";
import type { ChangeRequest, Profile } from "@/lib/types";

type Status = ChangeRequest["status"];
const VALID_STATUSES: Status[] = ["pending", "approved", "applied", "rejected"];

function statusBadge(status: Status) {
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

const FILTERS: { label: string; value: Status | null }[] = [
  { label: "All", value: null },
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Applied", value: "applied" },
  { label: "Rejected", value: "rejected" },
];

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: rawStatus } = await searchParams;
  const status: Status | null = VALID_STATUSES.includes(rawStatus as Status)
    ? (rawStatus as Status)
    : null;

  const supabase = await createClient();

  // Admin read overlay returns every client's rows.
  let query = supabase
    .from("change_requests")
    .select("*")
    .neq("status", "draft")
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data: requestsData } = await query;
  const requests = (requestsData ?? []) as ChangeRequest[];

  // Label each row WITHOUT embedded joins (which return arrays at runtime).
  // Fetch bot names + client profiles separately, then join in JS.
  const chatbotIds = [...new Set(requests.map((r) => r.chatbot_id))];
  const userIds = [...new Set(requests.map((r) => r.user_id))];

  const [{ data: botRows }, { data: profileRows }] = await Promise.all([
    chatbotIds.length
      ? supabase.from("chatbots").select("id, name").in("id", chatbotIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    userIds.length
      ? supabase.from("profiles").select("id, email, full_name").in("id", userIds)
      : Promise.resolve({
          data: [] as Pick<Profile, "id" | "email" | "full_name">[],
        }),
  ]);

  const botName = new Map<string, string>();
  for (const b of (botRows ?? []) as { id: string; name: string }[]) {
    botName.set(b.id, b.name);
  }
  const clientLabel = new Map<string, string>();
  for (const p of (profileRows ?? []) as Pick<
    Profile,
    "id" | "email" | "full_name"
  >[]) {
    clientLabel.set(p.id, p.full_name || p.email);
  }

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <PageShell>
      <PageHeader
        title="Change requests"
        description={
          <>
            {requests.length} {requests.length === 1 ? "request" : "requests"}
            {status === null && pendingCount > 0 ? (
              <>
                {" · "}
                <span className="font-semibold text-ss-body">
                  {pendingCount} pending
                </span>
              </>
            ) : null}
          </>
        }
      />

      <PageBody>
        <nav
          aria-label="Filter by status"
          className="flex flex-wrap items-center gap-2"
        >
          {FILTERS.map((f) => (
            <SsPill
              key={f.label}
              href={f.value ? `/admin/requests?status=${f.value}` : "/admin/requests"}
              active={status === f.value}
            >
              {f.label}
            </SsPill>
          ))}
        </nav>

        {requests.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-8 w-8" />}
            title={`No ${status ? `${status} ` : ""}requests`}
          >
            {status
              ? "Nothing is sitting in this status right now."
              : "Client change requests land here the moment they are submitted for review."}
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-2.5">
            {requests.map((cr) => (
              <SsCard
                key={cr.id}
                className="flex items-start gap-4 px-5 py-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {statusBadge(cr.status)}
                    <span className="text-[13px] font-semibold leading-none text-ss-ink">
                      {clientLabel.get(cr.user_id) ?? "Unknown client"}
                    </span>
                    <SsChip tone="neutral">
                      {botName.get(cr.chatbot_id) ?? "Unknown bot"}
                    </SsChip>
                    <span className="text-[11.5px] leading-none text-ss-muted tabular-nums">
                      {new Date(cr.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-ss-muted">
                    {cr.request_text}
                  </p>
                </div>
                <SsLinkButton
                  href={`/admin/requests/${cr.id}`}
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                >
                  Review
                </SsLinkButton>
              </SsCard>
            ))}
          </div>
        )}
      </PageBody>
    </PageShell>
  );
}
