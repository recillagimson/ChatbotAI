import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FlaskConical } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireSuperadmin } from "@/lib/admin";
import { ChatbotTabsBar } from "@/components/dashboard/chatbot-tabs-bar";
import { RetrainBotButton } from "@/components/dashboard/retrain-bot-button";
import {
  ChatbotTabPanel,
  ChatbotTabSkeleton,
} from "@/components/dashboard/chatbot-tab-panel";
import { PageBody, PageHeader, PageShell } from "@/components/ss/page";
import { SsStatus, SsLinkButton } from "@/components/ss/controls";
import { resolveChatbotTab, EDITING_CHATBOT_TABS } from "@/lib/chatbot-tabs";

export const dynamic = "force-dynamic";

/**
 * Superadmin per-bot management - the client dashboard's chatbot tabs, rendered
 * natively inside /admin (no "view as" needed). Reuses the shared ChatbotTabPanel
 * with ownerId = the client (so reads/writes stamp the client, not the admin) and a
 * base path on this route. The owner-scoped API routes each form calls were extended
 * to authorize superadmins (see lib/chatbot-access.ts). Overview is omitted here (it's
 * a client dashboard summary); the /admin client page carries the bot's overview.
 */
export default async function AdminClientBotPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; botId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id: clientId, botId } = await params;
  const tab = resolveChatbotTab((await searchParams).tab, EDITING_CHATBOT_TABS);

  // The (admin) layout already gates the area; re-check so this page can never render
  // (or read a client's bot) for a non-superadmin even if the layout gate changed.
  if (!(await requireSuperadmin())) notFound();

  const supabase = await createClient();
  // The superadmin RLS overlay authorizes the read; scoping to the client's user_id
  // makes a wrong client/bot pairing a clean 404.
  const { data: chatbot } = await supabase
    .from("chatbots")
    .select("id, name, is_active")
    .eq("id", botId)
    .eq("user_id", clientId)
    .maybeSingle();
  if (!chatbot) notFound();

  const basePath = `/admin/clients/${clientId}/bots/${botId}`;

  return (
    <PageShell>
      <PageHeader
        title={chatbot.name}
        description="Full chatbot settings, managed as this client - the same tabs as their dashboard."
        leading={
          <Link
            href={`/admin/clients/${clientId}`}
            className="mb-1 flex w-full items-center gap-1.5 text-[12px] font-semibold leading-none text-ss-muted transition-colors hover:text-ss-ink"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to client
          </Link>
        }
        actions={
          <>
            <SsStatus tone={chatbot.is_active ? "green" : "amber"}>
              {chatbot.is_active ? "Active" : "Paused"}
            </SsStatus>
            <SsLinkButton
              href={`${basePath}?tab=training`}
              variant="outline"
              size="md"
            >
              <FlaskConical className="h-4 w-4" aria-hidden="true" />
              Test in sandbox
            </SsLinkButton>
            <RetrainBotButton chatbotId={chatbot.id} />
          </>
        }
        below={<ChatbotTabsBar active={tab} tabs={EDITING_CHATBOT_TABS} />}
      />

      <PageBody>
        <Suspense key={tab} fallback={<ChatbotTabSkeleton tab={tab} />}>
          <ChatbotTabPanel
            chatbotId={botId}
            ownerId={clientId}
            basePath={basePath}
            tab={tab}
          />
        </Suspense>
      </PageBody>
    </PageShell>
  );
}
