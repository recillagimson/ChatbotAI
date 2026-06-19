import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminChatbotEditForm } from "@/components/admin/admin-chatbot-edit-form";
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
      return <Badge variant="success">Active</Badge>;
    case "trialing":
      return <Badge variant="default">Trialing</Badge>;
    case "past_due":
      return <Badge variant="warning">Past due</Badge>;
    case "canceled":
      return <Badge variant="secondary">Canceled</Badge>;
    case "incomplete":
      return <Badge variant="destructive">Incomplete</Badge>;
    default:
      return <Badge variant="outline">No sub</Badge>;
  }
}

function crBadge(status: ChangeRequest["status"]) {
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

function feedbackBadge(status: Feedback["status"]) {
  switch (status) {
    case "new":
      return <Badge variant="default">New</Badge>;
    case "read":
      return <Badge variant="secondary">Read</Badge>;
    case "resolved":
      return <Badge variant="success">Resolved</Badge>;
  }
}

type AdminChatbot = Pick<
  Chatbot,
  | "id"
  | "name"
  | "business_description"
  | "tone"
  | "system_prompt"
  | "instagram_username"
  | "is_active"
  | "created_at"
>;

export default async function AdminClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
  ] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("status, current_period_end, stripe_subscription_id")
      .eq("user_id", id)
      .maybeSingle(),
    supabase
      .from("chatbots")
      .select(
        "id, name, business_description, tone, system_prompt, instagram_username, is_active, created_at"
      )
      .eq("user_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("change_requests")
      .select("*")
      .eq("user_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("feedback")
      .select("*")
      .eq("user_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const subscription = subData as Pick<
    Subscription,
    "status" | "current_period_end" | "stripe_subscription_id"
  > | null;
  const chatbots = (chatbotsData ?? []) as AdminChatbot[];
  const requests = (requestsData ?? []) as ChangeRequest[];
  const feedback = (feedbackData ?? []) as Feedback[];

  return (
    <div>
      <div className="mb-8">
        <Link
          href="/admin"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← All clients
        </Link>
        <h1 className="mt-2 text-3xl font-display font-semibold tracking-tight">
          {profile.full_name || profile.email}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{profile.email}</span>
          {profile.company_name && (
            <>
              <span>·</span>
              <span>{profile.company_name}</span>
            </>
          )}
          <span>·</span>
          {subBadge(subscription?.status ?? null)}
          <span>·</span>
          <span>
            Joined {new Date(profile.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>

      <section className="mb-10">
        <h2 className="mb-4 text-xl font-display font-semibold tracking-tight">
          Chatbots ({chatbots.length})
        </h2>
        {chatbots.length === 0 ? (
          <p className="text-muted-foreground">
            This client has no chatbots yet.
          </p>
        ) : (
          <div className="space-y-6">
            {chatbots.map((bot) => (
              <Card key={bot.id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle>{bot.name}</CardTitle>
                  {bot.is_active ? (
                    <Badge variant="success">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Paused</Badge>
                  )}
                </CardHeader>
                <CardContent>
                  <AdminChatbotEditForm
                    chatbot={{
                      id: bot.id,
                      name: bot.name,
                      business_description: bot.business_description,
                      tone: bot.tone,
                      system_prompt: bot.system_prompt,
                      instagram_username: bot.instagram_username,
                      is_active: bot.is_active,
                    }}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-4 text-xl font-display font-semibold tracking-tight">
          Change requests ({requests.length})
        </h2>
        {requests.length === 0 ? (
          <p className="text-muted-foreground">No change requests.</p>
        ) : (
          <div className="rounded-lg border divide-y">
            {requests.map((cr) => (
              <div
                key={cr.id}
                className="flex items-start justify-between gap-4 p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {crBadge(cr.status)}
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {new Date(cr.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm">{cr.request_text}</p>
                </div>
                <Link
                  href={`/admin/requests/${cr.id}`}
                  className="shrink-0 text-sm font-medium text-primary hover:underline"
                >
                  Review →
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-display font-semibold tracking-tight">
          Feedback ({feedback.length})
        </h2>
        {feedback.length === 0 ? (
          <p className="text-muted-foreground">No feedback.</p>
        ) : (
          <div className="rounded-lg border divide-y">
            {feedback.map((fb) => (
              <div key={fb.id} className="p-4">
                <div className="flex items-center gap-2">
                  {feedbackBadge(fb.status)}
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {new Date(fb.created_at).toLocaleDateString()}
                  </span>
                  {fb.attachments?.length ? (
                    <span className="text-xs text-muted-foreground">
                      📎 {fb.attachments.length}{" "}
                      {fb.attachments.length === 1 ? "file" : "files"}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 line-clamp-2 text-sm">{fb.message}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
