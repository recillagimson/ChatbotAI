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
import { ViewAsButton } from "@/components/admin/view-as-button";
import { GrantAccessForm } from "@/components/admin/grant-access-form";
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
  | "persona_section"
  | "offers_section"
  | "rebuttals_section"
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
      .select(
        "status, current_period_end, stripe_subscription_id, comp_expires_at, comp_granted_at, comp_note"
      )
      .eq("user_id", id)
      .maybeSingle(),
    supabase
      .from("chatbots")
      .select(
        "id, name, business_description, tone, system_prompt, persona_section, offers_section, rebuttals_section, instagram_username, is_active, created_at"
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
  const requests = (requestsData ?? []) as ChangeRequest[];
  const feedback = (feedbackData ?? []) as Feedback[];

  const openRequests = requests.filter((r) => r.status === "pending").length;

  return (
    <div>
      <Link
        href="/admin"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← All clients
      </Link>

      <div className="mt-4 lg:grid lg:grid-cols-[300px_1fr] lg:gap-8">
        {/* Identifier - pinned to the side so it's always clear whose account this is. */}
        <aside className="mb-8 lg:mb-0 lg:sticky lg:top-8 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="break-words">
                {profile.full_name || profile.email}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Email</p>
                <p className="break-words">{profile.email}</p>
              </div>
              {profile.company_name && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Company</p>
                  <p className="break-words">{profile.company_name}</p>
                </div>
              )}
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Subscription</p>
                <div className="mt-1">
                  {compRow ? (
                    accessActive ? (
                      <Badge variant="success">Comp</Badge>
                    ) : (
                      <Badge variant="secondary">Comp expired</Badge>
                    )
                  ) : (
                    subBadge(subscription?.status ?? null)
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Joined</p>
                <p className="tabular-nums">
                  {new Date(profile.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="border-t pt-3">
                <ViewAsButton clientId={profile.id} label="Open client dashboard" variant="button" />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  See and act in their dashboard as them.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 border-t pt-3 text-center">
                <div>
                  <p className="text-lg font-semibold tabular-nums">{chatbots.length}</p>
                  <p className="text-xs text-muted-foreground">Chatbots</p>
                </div>
                <div>
                  <p className="text-lg font-semibold tabular-nums">{openRequests}</p>
                  <p className="text-xs text-muted-foreground">Open req.</p>
                </div>
                <div>
                  <p className="text-lg font-semibold tabular-nums">{feedback.length}</p>
                  <p className="text-xs text-muted-foreground">Feedback</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>

        {/* Main column */}
        <div className="min-w-0">
          <h1 className="mb-6 text-3xl font-display font-semibold tracking-tight lg:sr-only">
            {profile.full_name || profile.email}
          </h1>

          <section className="mb-10">
            <h2 className="mb-4 text-xl font-display font-semibold tracking-tight">
              Access
            </h2>
            <Card>
              <CardContent className="py-6">
                {paidActive ? (
                  <div className="text-sm">
                    <p className="font-medium">Active paid subscription</p>
                    <p className="mt-1 text-muted-foreground">
                      {paidRenews
                        ? `Renews on ${paidRenews.toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}.`
                        : "Managed by Stripe."}{" "}
                      No comp needed.
                    </p>
                  </div>
                ) : (
                  <GrantAccessForm
                    userId={profile.id}
                    compExpiresAt={subscription?.comp_expires_at ?? null}
                    compNote={subscription?.comp_note ?? null}
                  />
                )}
              </CardContent>
            </Card>
          </section>

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
                          instagram_username: bot.instagram_username,
                          is_active: bot.is_active,
                          persona_section: bot.persona_section,
                          offers_section: bot.offers_section,
                          rebuttals_section: bot.rebuttals_section,
                          system_prompt: bot.system_prompt,
                          business_description: bot.business_description,
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
      </div>
    </div>
  );
}
