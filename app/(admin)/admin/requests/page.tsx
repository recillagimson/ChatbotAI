import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import type { ChangeRequest, Profile } from "@/lib/types";

type Status = ChangeRequest["status"];
const VALID_STATUSES: Status[] = ["pending", "approved", "applied", "rejected"];

function statusBadge(status: Status) {
  switch (status) {
    case "pending":
      return <Badge variant="secondary">Pending</Badge>;
    case "approved":
      return <Badge variant="warning">Approved</Badge>;
    case "applied":
      return <Badge variant="success">Applied</Badge>;
    case "rejected":
      return <Badge variant="destructive">Rejected</Badge>;
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
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-display font-semibold tracking-tight">
          Change requests
        </h1>
        <p className="text-muted-foreground">
          {requests.length} {requests.length === 1 ? "request" : "requests"}
          {status === null && pendingCount > 0 && (
            <>
              {" · "}
              <span className="font-medium text-foreground">
                {pendingCount} pending
              </span>
            </>
          )}
        </p>
      </div>

      <nav
        aria-label="Filter by status"
        className="mb-6 flex flex-wrap gap-2"
      >
        {FILTERS.map((f) => {
          const active = status === f.value;
          return (
            <Link
              key={f.label}
              href={f.value ? `/admin/requests?status=${f.value}` : "/admin/requests"}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  : "rounded-full border border-input bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              }
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      {requests.length === 0 ? (
        <p className="text-muted-foreground">
          No {status ? `${status} ` : ""}requests.
        </p>
      ) : (
        <div className="rounded-lg border divide-y">
          {requests.map((cr) => (
            <div
              key={cr.id}
              className="flex items-start justify-between gap-4 p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {statusBadge(cr.status)}
                  <span className="text-sm font-medium">
                    {clientLabel.get(cr.user_id) ?? "Unknown client"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {botName.get(cr.chatbot_id) ?? "Unknown bot"}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {new Date(cr.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {cr.request_text}
                </p>
              </div>
              <Link
                href={`/admin/requests/${cr.id}`}
                className="shrink-0 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:underline"
              >
                Review →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
