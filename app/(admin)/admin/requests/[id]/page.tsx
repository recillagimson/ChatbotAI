import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageBody, PageHeader, PageShell, Callout } from "@/components/ss/page";
import { SsChip, SsStatus } from "@/components/ss/controls";
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
      return <SsChip tone="neutral">Draft</SsChip>;
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
    <PageShell>
      <PageHeader
        title={botName}
        description={clientEmail ?? undefined}
        leading={
          <Link
            href="/admin/requests"
            className="inline-flex items-center gap-1 text-[12px] font-semibold leading-none text-ss-muted transition-colors hover:text-ss-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            All requests
          </Link>
        }
        actions={
          <>
            {statusBadge(cr.status)}
            <span className="text-[11.5px] leading-none text-ss-muted tabular-nums">
              Submitted {new Date(cr.created_at).toLocaleDateString()}
            </span>
            {cr.reviewed_at && (
              <span className="text-[11.5px] leading-none text-ss-muted tabular-nums">
                Reviewed {new Date(cr.reviewed_at).toLocaleDateString()}
              </span>
            )}
          </>
        }
      />

      <PageBody center maxWidth={768}>
        {cr.status === "draft" ? (
          <Callout tone="indigo" title="Still a draft">
            The client hasn&apos;t submitted this request for review yet. It will
            appear in the queue once they submit it.
          </Callout>
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
          <Callout tone="rose" title="Chatbot missing">
            The chatbot for this request no longer exists.
          </Callout>
        )}
      </PageBody>
    </PageShell>
  );
}
