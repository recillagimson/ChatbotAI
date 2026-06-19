import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signAttachment } from "@/lib/storage";
import { FeedbackInbox } from "@/components/admin/feedback-inbox";
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

  const newCount = feedback.filter((f) => f.status === "new").length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-display font-semibold tracking-tight">
          Feedback
        </h1>
        <p className="text-muted-foreground">
          {feedback.length} {feedback.length === 1 ? "item" : "items"}
          {status === null && newCount > 0 && (
            <>
              {" · "}
              <span className="font-medium text-foreground">
                {newCount} new
              </span>
            </>
          )}
        </p>
      </div>

      <nav aria-label="Filter by status" className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = status === f.value;
          return (
            <Link
              key={f.label}
              href={f.value ? `/admin/feedback?status=${f.value}` : "/admin/feedback"}
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

      <FeedbackInbox items={items} />
    </div>
  );
}
