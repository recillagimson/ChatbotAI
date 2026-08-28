import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, FlaskConical } from "lucide-react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { ChatbotTabsBar } from "@/components/dashboard/chatbot-tabs-bar";
import { RetrainBotButton } from "@/components/dashboard/retrain-bot-button";
import {
  ChatbotTabPanel,
  ChatbotTabSkeleton,
} from "@/components/dashboard/chatbot-tab-panel";
import { PageBody, PageHeader, PageShell } from "@/components/ss/page";
import { SsStatus, SsLinkButton } from "@/components/ss/controls";
import { resolveChatbotTab } from "@/lib/chatbot-tabs";
import { platformLabel } from "@/lib/platforms";

export const dynamic = "force-dynamic";

/**
 * Manage one chatbot.
 *
 * The tab body lives in the shared ChatbotTabPanel component (also rendered by the
 * superadmin per-bot route under /admin/clients); this shell owns only the header,
 * the health-strip channel subtitle, and the tab strip.
 */
export default async function ChatbotDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const tab = resolveChatbotTab((await searchParams).tab);
  const supabase = await createClient();
  const user = await getCurrentUser();

  // Only what the header needs: the row itself, plus the two channel counts the
  // subtitle reads (fetched here so every tab renders a connected bot correctly).
  const [{ data: chatbot }, { count: igCount }, { count: fbCount }] =
    await Promise.all([
      supabase
        .from("chatbots")
        .select("id, name, tone, is_active")
        .eq("id", id)
        .eq("user_id", user!.id)
        .single(),
      supabase
        .from("conversations")
        .select("*", { count: "exact", head: true })
        .eq("chatbot_id", id)
        .or("platform.is.null,platform.eq.instagram"),
      supabase
        .from("conversations")
        .select("*", { count: "exact", head: true })
        .eq("chatbot_id", id)
        .eq("platform", "messenger"),
    ]);

  if (!chatbot) notFound();

  const liveChannels = [
    { key: "instagram" as const, label: platformLabel("instagram"), count: igCount ?? 0 },
    { key: "messenger" as const, label: platformLabel("messenger"), count: fbCount ?? 0 },
  ].filter((c) => c.count > 0);

  return (
    <PageShell>
      <PageHeader
        title={chatbot.name}
        description={
          liveChannels.length
            ? `${liveChannels.map((c) => c.label).join(" + ")} via ManyChat · tone: ${chatbot.tone}`
            : `Not connected yet · tone: ${chatbot.tone}`
        }
        leading={
          <Link
            href="/chatbots"
            className="mb-1 flex w-full items-center gap-1.5 text-[12px] font-semibold leading-none text-ss-muted transition-colors hover:text-ss-ink"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Chatbots
          </Link>
        }
        actions={
          <>
            <SsStatus tone={chatbot.is_active ? "green" : "amber"}>
              {chatbot.is_active ? "Active" : "Paused"}
            </SsStatus>
            <SsLinkButton
              href={`/chatbots/${id}?tab=training`}
              variant="outline"
              size="md"
            >
              <FlaskConical className="h-4 w-4" aria-hidden="true" />
              Test in sandbox
            </SsLinkButton>
            <RetrainBotButton chatbotId={chatbot.id} />
          </>
        }
        below={<ChatbotTabsBar active={tab} />}
      />

      <PageBody>
        <Suspense key={tab} fallback={<ChatbotTabSkeleton tab={tab} />}>
          <ChatbotTabPanel
            chatbotId={id}
            ownerId={user!.id}
            basePath={`/chatbots/${id}`}
            tab={tab}
          />
        </Suspense>
      </PageBody>
    </PageShell>
  );
}
