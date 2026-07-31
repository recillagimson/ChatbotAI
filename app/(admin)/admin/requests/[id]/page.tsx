import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { ChangeRequestReview } from "@/components/admin/change-request-review";
import { signAttachment } from "@/lib/storage";
import { sectionColumnFor } from "@/lib/change-categories";
import type {
  ChangeRequest,
  Chatbot,
  Profile,
  TranscriptMessage,
} from "@/lib/types";

function statusBadge(status: ChangeRequest["status"]) {
  switch (status) {
    case "draft":
      return <Badge variant="secondary">Draft</Badge>;
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

  // Sign the transcript's image + document paths server-side (admin "upload read" policy).
  const transcript = (cr.transcript ?? []) as TranscriptMessage[];
  const transcriptView = await Promise.all(
    transcript.map(async (m) => {
      if (m.role !== "user") return { role: m.role, content: m.content };
      const images = m.images?.length
        ? await Promise.all(
            m.images.map(async (im) => ({
              name: im.name,
              url: await signAttachment(supabase, im.path),
            }))
          )
        : undefined;
      const files = m.files?.length
        ? await Promise.all(
            m.files.map(async (f) => ({
              name: f.name,
              url: await signAttachment(supabase, f.path),
            }))
          )
        : undefined;
      return {
        role: m.role,
        content: m.content,
        ...(images ? { images } : {}),
        ...(files ? { files } : {}),
      };
    })
  );

  const { data: chatbotData } = await supabase
    .from("chatbots")
    .select(
      "id, name, system_prompt, persona_section, offers_section, rebuttals_section, business_description, tone, instagram_username, user_id"
    )
    .eq("id", cr.chatbot_id)
    .maybeSingle();
  const chatbot = chatbotData as Pick<
    Chatbot,
    | "id"
    | "name"
    | "system_prompt"
    | "persona_section"
    | "offers_section"
    | "rebuttals_section"
    | "business_description"
    | "tone"
    | "instagram_username"
    | "user_id"
  > | null;

  // Current text of the section this request targets (the "before" for review).
  const sectionCol = sectionColumnFor(cr.category);
  const currentSection = sectionCol && chatbot ? (chatbot[sectionCol] ?? "") : "";
  // All three sections - the "before" for an "overall" request's multi-section diff.
  const currentSections = {
    persona_section: chatbot?.persona_section ?? "",
    offers_section: chatbot?.offers_section ?? "",
    rebuttals_section: chatbot?.rebuttals_section ?? "",
  };

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

      {cr.status === "draft" ? (
        <p className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          This request is still a draft - the client hasn&apos;t submitted it for
          review yet. It will appear in the queue once they submit it.
        </p>
      ) : chatbot ? (
        <ChangeRequestReview
          request={cr}
          chatbot={{
            id: chatbot.id,
            name: chatbot.name,
            system_prompt: chatbot.system_prompt,
          }}
          currentSection={currentSection}
          currentSections={currentSections}
          clientEmail={clientEmail}
          transcript={transcriptView}
        />
      ) : (
        <p className="text-destructive">
          The chatbot for this request no longer exists.
        </p>
      )}
    </div>
  );
}
