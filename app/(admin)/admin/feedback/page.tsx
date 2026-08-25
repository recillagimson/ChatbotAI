import { MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signAttachment } from "@/lib/storage";
import { FeedbackInbox } from "@/components/admin/feedback-inbox";
import { PageBody, PageHeader, PageShell, EmptyState } from "@/components/ss/page";
import { SsPill } from "@/components/ss/controls";
import type { Attachment, Feedback, Profile } from "@/lib/types";

type Status = Feedback["status"];
const VALID_STATUSES: Status[] = ["new", "read", "resolved"];

const FILTERS: { label: string; value: Status | null }[] = [
  { label: "All", value: null },
  { label: "New", value: "new" },
  { label: "Read", value: "read" },
  { label: "Resolved", value: "resolved" },
];

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: rawStatus } = await searchParams;
  const status: Status | null = VALID_STATUSES.includes(rawStatus as Status)
    ? (rawStatus as Status)
    : null;

  const supabase = await createClient();

  // Admin read overlay returns every client's feedback.
  let query = supabase
    .from("feedback")
    .select("*")
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data: feedbackData } = await query;
  const feedback = (feedbackData ?? []) as Feedback[];

  // Label each row WITHOUT embedded joins (which return arrays at runtime).
  // Fetch client profiles + bot names separately, then join in JS.
  const userIds = [...new Set(feedback.map((f) => f.user_id))];
  const chatbotIds = [
    ...new Set(
      feedback.map((f) => f.chatbot_id).filter((v): v is string => v !== null)
    ),
  ];

  const [{ data: profileRows }, { data: botRows }] = await Promise.all([
    userIds.length
      ? supabase.from("profiles").select("id, email, full_name").in("id", userIds)
      : Promise.resolve({
          data: [] as Pick<Profile, "id" | "email" | "full_name">[],
        }),
    chatbotIds.length
      ? supabase.from("chatbots").select("id, name").in("id", chatbotIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const clientEmail = new Map<string, string>();
  const clientName = new Map<string, string | null>();
  for (const p of (profileRows ?? []) as Pick<
    Profile,
    "id" | "email" | "full_name"
  >[]) {
    clientEmail.set(p.id, p.email);
    clientName.set(p.id, p.full_name);
  }
  const botName = new Map<string, string>();
  for (const b of (botRows ?? []) as { id: string; name: string }[]) {
    botName.set(b.id, b.name);
  }

  const items = await Promise.all(
    feedback.map(async (f) => ({
      id: f.id,
      message: f.message,
      status: f.status,
      created_at: f.created_at,
      admin_note: f.admin_note,
      clientEmail: clientEmail.get(f.user_id) ?? null,
      clientName: clientName.get(f.user_id) ?? null,
      botName: f.chatbot_id ? botName.get(f.chatbot_id) ?? null : null,
      attachments: await Promise.all(
        ((f.attachments ?? []) as Attachment[]).map(async (a) => ({
          ...a,
          url: await signAttachment(supabase, a.path),
        }))
      ),
    }))
  );

  // Per-status counts for the filter pills. These are only complete when nothing
  // is filtered out (the query narrows to one status when a filter is active), so
  // the pills carry counts on the "All" view and read as plain labels otherwise.
  const statusCounts: Record<Status, number> = {
    new: feedback.filter((f) => f.status === "new").length,
    read: feedback.filter((f) => f.status === "read").length,
    resolved: feedback.filter((f) => f.status === "resolved").length,
  };
  const newCount = statusCounts.new;

  return (
    <PageShell>
      <PageHeader
        title="Feedback"
        description={
          <>
            {feedback.length} {feedback.length === 1 ? "item" : "items"}
            {status === null && newCount > 0 && (
              <>
                {" · "}
                <span className="font-semibold text-ss-body">{newCount} new</span>
              </>
            )}
          </>
        }
      />

      <PageBody>
        <nav
          aria-label="Filter by status"
          className="flex flex-wrap items-center gap-2"
        >
          {FILTERS.map((f) => {
            const active = status === f.value;
            const count =
              status === null
                ? f.value === null
                  ? feedback.length
                  : statusCounts[f.value]
                : null;
            return (
              <SsPill
                key={f.label}
                href={
                  f.value
                    ? `/admin/feedback?status=${f.value}`
                    : "/admin/feedback"
                }
                active={active}
                count={count}
              >
                {f.label}
              </SsPill>
            );
          })}
        </nav>

        {items.length === 0 ? (
          <EmptyState
            icon={<MessageSquare className="h-8 w-8" />}
            title={status ? `No ${status} feedback` : "No feedback yet"}
          >
            {status
              ? "Nothing in this status right now."
              : "Client feedback lands here as it comes in, with any screenshots attached."}
          </EmptyState>
        ) : (
          <FeedbackInbox items={items} />
        )}
      </PageBody>
    </PageShell>
  );
}
