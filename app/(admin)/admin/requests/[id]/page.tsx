import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { ChangeRequestReview } from "@/components/admin/change-request-review";
import type { ChangeRequest, Chatbot, Profile } from "@/lib/types";

function statusBadge(status: ChangeRequest["status"]) {
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

export default async function AdminRequestReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: crData } = await supabase
    .from("change_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!crData) notFound();
  const cr = crData as ChangeRequest;

  const { data: chatbotData } = await supabase
    .from("chatbots")
    .select(
      "id, name, system_prompt, business_description, tone, instagram_username, user_id"
    )
    .eq("id", cr.chatbot_id)
    .maybeSingle();
  const chatbot = chatbotData as Pick<
    Chatbot,
    | "id"
    | "name"
    | "system_prompt"
    | "business_description"
    | "tone"
    | "instagram_username"
    | "user_id"
  > | null;

  const { data: profileData } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", cr.user_id)
    .maybeSingle();
  const profile = profileData as Pick<Profile, "email" | "full_name"> | null;

  const clientEmail = profile?.email ?? null;
  const botName = chatbot?.name ?? "Unknown bot";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <Link
          href="/admin/requests"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← All change requests
        </Link>
        <h1 className="mt-2 text-3xl font-display font-semibold tracking-tight">
          {botName}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {clientEmail && <span>{clientEmail}</span>}
          {clientEmail && <span>·</span>}
          {statusBadge(cr.status)}
          <span>·</span>
          <span className="tabular-nums">
            Submitted {new Date(cr.created_at).toLocaleDateString()}
          </span>
          {cr.reviewed_at && (
            <>
              <span>·</span>
              <span className="tabular-nums">
                Reviewed {new Date(cr.reviewed_at).toLocaleDateString()}
              </span>
            </>
          )}
        </div>
      </div>

      {chatbot ? (
        <ChangeRequestReview
          request={cr}
          chatbot={{
            id: chatbot.id,
            name: chatbot.name,
            system_prompt: chatbot.system_prompt,
          }}
          clientEmail={clientEmail}
        />
      ) : (
        <p className="text-destructive">
          The chatbot for this request no longer exists.
        </p>
      )}
    </div>
  );
}
