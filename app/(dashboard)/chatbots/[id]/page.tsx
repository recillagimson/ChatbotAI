import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  FlaskConical,
  GraduationCap,
  Key,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { FollowupSequenceForm } from "@/components/dashboard/followup-sequence-form";
import { KeepRepliesToggle } from "@/components/dashboard/keep-replies-toggle";
import { WelcomeForm } from "@/components/dashboard/welcome-form";
import { KeywordTriggersForm } from "@/components/dashboard/keyword-triggers-form";
import { FollowupAssetManager } from "@/components/dashboard/followup-asset-manager";
import { ChatbotEditForm } from "@/components/dashboard/chatbot-edit-form";
import { BotActiveToggle } from "@/components/dashboard/bot-active-toggle";
import { ManychatKeyField } from "@/components/dashboard/manychat-key-field";
import { WebhookSecretField } from "@/components/dashboard/webhook-secret-field";
import { ChatbotTabsBar } from "@/components/dashboard/chatbot-tabs-bar";
import { Sk, SkCard, SkCardHead } from "@/components/ss/skeleton";
import { BotTrainer } from "@/components/dashboard/bot-trainer";
import { RetrainBotButton } from "@/components/dashboard/retrain-bot-button";
import { PageBody, PageHeader, PageShell } from "@/components/ss/page";
import { SsCard, SsCardHead, SsCardLink } from "@/components/ss/card";
import { SsChip, SsLinkButton, SsStatus } from "@/components/ss/controls";
import { ChannelTile } from "@/components/ss/channel";
import { NavyPanel, PanelDivider } from "@/components/ss/panel";
import { StatBlock } from "@/components/ss/stat";
import { type ChatbotTabKey, resolveChatbotTab } from "@/lib/chatbot-tabs";
import { stepAssetKeys } from "@/lib/followup-assets";
import { requireSuperadmin } from "@/lib/admin";
import { FOLLOWUP_ENABLED } from "@/lib/followup";
import { formatSecs, num } from "@/lib/format";
import { getAnalyticsOverview, resolveRange } from "@/lib/analytics";
import { PLATFORM_META, platformLabel } from "@/lib/platforms";
import type { Chatbot, FollowupAsset } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Manage one chatbot.
 *
 * The design's Overview tab leads with a navy health strip - is it on, how much
 * is flowing through it, how fast it answers, how much it actually knows - then
 * "what to fix next", ranked by how often each gap costs a reply. Everything
 * else keeps its existing forms under the same chrome.
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
  // subtitle reads. Those counts used to be fetched on the Overview tab alone,
  // which meant every other tab rendered a connected bot as "Not connected yet".
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
          <ChatbotTabPanel id={id} tab={tab} />
        </Suspense>
      </PageBody>
    </PageShell>
  );
}

/**
 * One tab's contents.
 *
 * Split out from the page so the tab strip can sit outside a Suspense boundary
 * keyed on `tab`. Switching tabs only rewrites the query string, which never
 * triggers `loading.tsx`, so without that boundary a click on Overview - the
 * one tab that waits on the analytics report - would leave the previous tab on
 * screen with no feedback for as long as the report takes.
 *
 * It re-reads the chatbot row rather than taking fifteen props from the shell.
 * That's one indexed primary-key lookup per tab render, which is cheaper than
 * the threading it replaces is to maintain.
 */
async function ChatbotTabPanel({ id, tab }: { id: string; tab: ChatbotTabKey }) {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const { data: chatbot } = await supabase
    .from("chatbots")
    .select("*")
    .eq("id", id)
    .eq("user_id", user!.id)
    .single();

  if (!chatbot) notFound();

  const apiKeySet = !!chatbot.manychat_api_key_enc;
  // Never serialize the encrypted key to the browser; the client forms don't use it.
  const safeChatbot = { ...chatbot, manychat_api_key_enc: null } as Chatbot;

  // Overview-only stats - skip these queries on every other tab.
  // There's no stored per-channel "connected" flag in this data model (the
  // ManyChat key is one shared credential; the channel is decided per inbound
  // message). The honest signal for "is this bot live on a channel" is whether
  // DMs have actually flowed on it - so we count conversations per platform.
  // Facebook is exactly platform="messenger"; Instagram also absorbs legacy
  // rows whose platform is null (DEFAULT_PLATFORM is instagram).
  let kbCount = 0;
  let convCount = 0;
  let igCount = 0;
  let fbCount = 0;
  let medianSecs: number | null = null;
  let deliveryFailures = 0;
  if (tab === "overview") {
    const month = resolveRange({ range: "30d" });
    const [{ count: kb }, { count: conv }, { count: ig }, { count: fb }, stats] =
      await Promise.all([
        supabase
          .from("knowledge_base")
          .select("*", { count: "exact", head: true })
          .eq("chatbot_id", id),
        supabase
          .from("conversations")
          .select("*", { count: "exact", head: true })
          .eq("chatbot_id", id),
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
        getAnalyticsOverview(supabase, {
          from: month.from,
          to: month.to,
          chatbotId: id,
        }),
      ]);
    kbCount = kb ?? 0;
    convCount = conv ?? 0;
    igCount = ig ?? 0;
    fbCount = fb ?? 0;
    medianSecs = stats.overview?.response_time.median_secs ?? null;
    deliveryFailures = stats.overview?.usage.delivery_failures ?? 0;
  }

  const channels = [
    {
      key: "instagram" as const,
      label: platformLabel("instagram"),
      count: igCount,
      note: chatbot.instagram_username ? `@${chatbot.instagram_username}` : null,
    },
    {
      key: "messenger" as const,
      label: platformLabel("messenger"),
      count: fbCount,
      note: null,
    },
  ];

  // The asset library is shared by the Follow-ups, Media, and Keywords tabs;
  // fetch it only when one of those is active.
  let assets: FollowupAsset[] = [];
  if (tab === "followups" || tab === "media" || tab === "keywords") {
    const { data: followupAssets } = await supabase
      .from("followup_assets")
      .select(
        "id, chatbot_id, user_id, key, label, description, kind, storage_path, url, mime, created_at"
      )
      .eq("chatbot_id", id)
      .order("created_at", { ascending: true });
    assets = (followupAssets ?? []) as FollowupAsset[];
  }

  // Admins may edit Offers & Rebuttals directly on the Prompt tab (own bots AND
  // while viewing a client - requireSuperadmin keys off the REAL user, not the
  // impersonated one). Only checked on the Prompt tab to avoid the extra query.
  const canEditSections = tab === "prompt" ? !!(await requireSuperadmin()) : false;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const webhookUrl = `${appUrl}/api/webhooks/manychat`;

  const liveChannels = channels.filter((c) => c.count > 0);
  const keywordGroups = Array.isArray(chatbot.keyword_triggers)
    ? chatbot.keyword_triggers.length
    : 0;
  const keywords: string[] = Array.isArray(chatbot.keyword_triggers)
    ? (chatbot.keyword_triggers as { keywords?: string[] }[])
        .flatMap((g) => g.keywords ?? [])
        .slice(0, 6)
    : [];

  return (
    <>
        {/* ── Overview ── */}
        {tab === "overview" && (
          <>
            <NavyPanel
              streaks={false}
              className="flex flex-wrap items-center gap-x-8 gap-y-5 rounded-card px-[22px] py-[18px]"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-chip bg-ss-indigo/30">
                  <Zap className="h-[21px] w-[21px] text-ss-indigo-300" aria-hidden="true" />
                </span>
                <div>
                  <div className="ss-eyebrow tracking-[0.14em] text-ss-nav-meta">
                    AI auto-replies
                  </div>
                  <div className="mt-1.5 font-display text-[15px] font-bold leading-none text-white">
                    {chatbot.is_active
                      ? "On - answering every DM"
                      : "Off - this bot is silent"}
                  </div>
                </div>
              </div>

              <PanelDivider className="hidden h-10 sm:block" />

              <div className="flex flex-wrap gap-x-9 gap-y-4">
                <StatBlock dark label="Threads" value={num(convCount)} />
                <StatBlock dark label="Median reply" value={formatSecs(medianSecs)} />
                <StatBlock
                  dark
                  label="Knowledge"
                  value={num(kbCount)}
                  suffix={
                    kbCount === 0
                      ? "no entries - it will guess"
                      : kbCount < 6
                        ? "entries - thin"
                        : "entries"
                  }
                />
                {deliveryFailures > 0 && (
                  <StatBlock
                    dark
                    label="Failed sends · 30d"
                    value={num(deliveryFailures)}
                    suffix="outside the 24h window"
                  />
                )}
              </div>

              <div className="ml-auto">
                <BotActiveToggle
                  chatbotId={chatbot.id}
                  initialActive={chatbot.is_active}
                  dark
                />
              </div>
            </NavyPanel>

            <KeepRepliesToggle
              chatbotId={chatbot.id}
              initial={chatbot.keep_replies_when_tagged}
            />

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              {/* Channels */}
              <SsCard className="p-[22px]">
                <SsCardHead
                  title="Channels"
                  action={
                    <SsCardLink href={`/chatbots/${id}?tab=connection`}>
                      Manage connection
                    </SsCardLink>
                  }
                />
                <div className="mt-3.5 flex flex-col gap-2.5">
                  {channels.map((ch) => (
                    <div
                      key={ch.key}
                      className="flex items-center gap-3 rounded-chip border border-ss-line px-3.5 py-3"
                    >
                      <ChannelTile platform={ch.key} muted={ch.count === 0} />
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold leading-none text-ss-ink">
                          {ch.label}
                        </div>
                        <div className="mt-1 truncate text-[11.5px] leading-none text-ss-muted">
                          {ch.note ? `${ch.note} · ` : ""}
                          {ch.count > 0
                            ? `${num(ch.count)} thread${ch.count === 1 ? "" : "s"}`
                            : "No messages yet"}
                        </div>
                      </div>
                      <SsStatus
                        tone={ch.count > 0 ? "green" : "neutral"}
                        className="ml-auto"
                      >
                        {ch.count > 0 ? "Active" : "Idle"}
                      </SsStatus>
                    </div>
                  ))}

                  <div className="flex items-center gap-3 rounded-chip border border-dashed border-ss-dash px-3.5 py-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-ctl bg-ss-chip text-[11px] font-bold text-ss-muted">
                      +3
                    </span>
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold leading-none text-ss-muted">
                        WhatsApp · Telegram · TikTok
                      </div>
                      <div className="mt-1 text-[11.5px] leading-none text-ss-faint">
                        Included in your plan - one ManyChat flow each
                      </div>
                    </div>
                    <SsCardLink
                      href={`/chatbots/${id}?tab=connection`}
                      className="ml-auto"
                    >
                      Connect
                    </SsCardLink>
                  </div>
                </div>

                <div className="mt-4 rounded-chip bg-ss-page px-3.5 py-3">
                  <div className="flex items-center gap-2">
                    <Key
                      className={`h-4 w-4 shrink-0 ${apiKeySet ? "text-ss-green" : "text-ss-amber"}`}
                      aria-hidden="true"
                    />
                    <span className="text-[12.5px] font-semibold leading-none text-ss-ink">
                      ManyChat API key
                    </span>
                    <span
                      className={`ml-auto text-[11.5px] font-semibold leading-none ${
                        apiKeySet ? "text-ss-green-ink" : "text-ss-amber-ink"
                      }`}
                    >
                      {apiKeySet ? "Connected" : "Not set"}
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-[11.5px] leading-relaxed text-ss-muted">
                    {apiKeySet
                      ? `•••••••• stored encrypted · webhook secret ${maskSecret(chatbot.webhook_secret)}`
                      : "Add the key on the Connection tab and replies start going out."}
                  </p>
                </div>
              </SsCard>

              <div className="flex flex-col gap-5">
                {/* What to fix next */}
                <SsCard className="p-[22px]">
                  <SsCardHead
                    title="What to fix next"
                    description="Ranked by how often it costs you a reply."
                  />
                  <div className="mt-3.5 flex flex-col gap-2.5">
                    {buildFixes({
                      id,
                      kbCount,
                      apiKeySet,
                      isActive: chatbot.is_active,
                      liveChannels: liveChannels.length,
                      deliveryFailures,
                      trained: Array.isArray(chatbot.training_pairs)
                        ? chatbot.training_pairs.length
                        : 0,
                    }).map((f) => (
                      <div
                        key={f.title}
                        className={`flex gap-2.5 rounded-chip border px-3.5 py-3 ${
                          f.urgent
                            ? "border-ss-amber-line bg-ss-amber-tint"
                            : "border-ss-line"
                        }`}
                      >
                        {f.urgent ? (
                          <TriangleAlert
                            className="h-[17px] w-[17px] shrink-0 text-ss-amber"
                            aria-hidden="true"
                          />
                        ) : (
                          <GraduationCap
                            className="h-[17px] w-[17px] shrink-0 text-ss-muted"
                            aria-hidden="true"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-[12.5px] font-semibold leading-snug text-ss-ink">
                            {f.title}
                          </div>
                          <p
                            className={`mt-1 text-[11.5px] leading-relaxed ${
                              f.urgent ? "text-ss-amber-ink" : "text-ss-body"
                            }`}
                          >
                            {f.body}
                          </p>
                          <Link
                            href={f.href}
                            className={`mt-1.5 inline-block text-[11.5px] font-semibold leading-none ${
                              f.urgent ? "text-ss-amber-ink" : "text-ss-indigo-600"
                            }`}
                          >
                            {f.cta} →
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </SsCard>

                {/* Keyword triggers */}
                <SsCard className="p-[22px]">
                  <SsCardHead
                    title="Keyword triggers"
                    action={
                      <span className="rounded-full bg-ss-chip px-2.5 py-1 text-[11px] font-semibold leading-none text-ss-body">
                        {keywordGroups} group{keywordGroups === 1 ? "" : "s"} ·{" "}
                        {chatbot.keyword_gate_enabled ? "gate on" : "gate off"}
                      </span>
                    }
                  />
                  {keywords.length > 0 ? (
                    <div className="mt-3.5 flex flex-wrap gap-1.5">
                      {keywords.map((k) => (
                        <SsChip key={k} tone="indigo" className="normal-case">
                          {k}
                        </SsChip>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3.5 text-[12px] leading-relaxed text-ss-muted">
                      No keywords yet. A keyword lets a lead skip straight to the
                      offer - the fastest path to a link this product has.
                    </p>
                  )}
                  <div className="mt-3.5">
                    <SsCardLink href={`/chatbots/${id}?tab=keywords`}>
                      Edit keyword triggers →
                    </SsCardLink>
                  </div>
                </SsCard>
              </div>
            </div>
          </>
        )}

        {/* ── Prompt ── */}
        {tab === "prompt" && (
          <SsCard className="p-[22px]">
            <SsCardHead
              title="Personality &amp; instructions"
              description="The name, AI instructions and tone. Changes apply to new replies right away."
              className="mb-5"
            />
            <ChatbotEditForm chatbot={safeChatbot} canEditSections={canEditSections} />
          </SsCard>
        )}

        {/* ── Keywords ── */}
        {tab === "keywords" && (
          <SsCard className="p-[22px]">
            <SsCardHead
              title="Keyword triggers"
              description={`Send an instant canned reply when a lead's DM contains a keyword (like "63") - the first time only. Say it again later and the bot picks up naturally instead of repeating the pitch.`}
              className="mb-5"
            />
            <KeywordTriggersForm chatbot={safeChatbot} assets={assets} />
          </SsCard>
        )}

        {/* ── Training ── */}
        {tab === "training" && (
          <SsCard className="p-[22px]">
            <SsCardHead
              title="Bot trainer"
              description="Chat with your bot to test it, then correct any reply - “say this instead” - to teach it that scenario. The sandbox is private; nothing here reaches a real contact."
              className="mb-5"
            />
            <BotTrainer chatbot={safeChatbot} />
          </SsCard>
        )}

        {/* ── Follow-ups ── */}
        {tab === "followups" && (
          <>
            <SsCard className="p-[22px]">
              <SsCardHead
                title="Welcome message"
                description="Greet brand-new contacts with a voice or video note when they open with a greeting or keyword - but let the AI read and answer openers that carry an image or real detail."
                className="mb-5"
              />
              <WelcomeForm chatbot={safeChatbot} />
            </SsCard>
            <SsCard className="p-[22px]">
              <SsCardHead
                title="Auto follow-up"
                description="A timed sequence that re-engages contacts who stop replying, escalating with media until they convert."
                className="mb-5"
              />
              {FOLLOWUP_ENABLED ? (
                <FollowupSequenceForm chatbot={safeChatbot} assets={assets} />
              ) : (
                <p className="text-[12.5px] text-ss-muted">
                  Auto follow-up is currently disabled for this deployment.
                </p>
              )}
            </SsCard>
          </>
        )}

        {/* ── Media ── */}
        {tab === "media" && (
          <SsCard className="p-[22px]">
            <SsCardHead
              title="Follow-up assets"
              description="Pictures, voice notes, videos and links you can attach to follow-up steps or let the AI send during a chat."
              className="mb-5"
            />
            <FollowupAssetManager
              chatbotId={chatbot.id}
              userId={user!.id}
              assets={assets}
              usedKeys={(safeChatbot.auto_followup_steps ?? []).flatMap((s) =>
                stepAssetKeys(s)
              )}
            />
          </SsCard>
        )}

        {/* ── Connection ── */}
        {tab === "connection" && (
          <>
            <SsCard className="p-[22px]">
              <SsCardHead
                title="ManyChat API key"
                description="The key SpeedSettr uses to send replies from this account."
                className="mb-5"
              />
              <ManychatKeyField chatbotId={chatbot.id} configured={apiKeySet} />
            </SsCard>

            <SsCard className="p-[22px]">
              <SsCardHead
                title="Connect ManyChat to this chatbot"
                description="Paste these values into your ManyChat External Request action. Build one flow per channel and set the platform value in each."
                className="mb-5"
              />
              <div className="flex flex-col gap-4">
                <Field label="Webhook URL" value={webhookUrl} />
                <Field label="HTTP method" value="POST" />
                <Field label="Required header (name)" value="x-manychat-secret" />
                <div>
                  <p className="ss-eyebrow mb-1.5 text-ss-muted">
                    Secret value (this chatbot)
                  </p>
                  <WebhookSecretField
                    chatbotId={chatbot.id}
                    secret={chatbot.webhook_secret}
                  />
                </div>
                <Field
                  label="JSON body fields to send"
                  value={`{
  "chatbot_id": "${chatbot.id}",
  "platform": "instagram",
  "subscriber_id": "{{user_id}}",
  "username": "{{user_name}}",
  "first_name": "{{first_name}}",
  "message": "{{last_input_text}}"
}`}
                />
                <p className="text-[12.5px] leading-relaxed text-ss-body">
                  Set <Code>platform</Code> to the channel this flow runs on - one
                  of <Code>instagram</Code>, <Code>messenger</Code> (Facebook),{" "}
                  <Code>whatsapp</Code>, <Code>telegram</Code> or{" "}
                  <Code>tiktok</Code>. Use that channel&apos;s username variable
                  (e.g. <Code>{"{{ig_username}}"}</Code> on Instagram).
                </p>
                <p className="text-[12.5px] leading-relaxed text-ss-body">
                  For Instagram, Facebook, WhatsApp and Telegram the reply is
                  delivered automatically - no extra step needed.{" "}
                  <strong className="font-semibold text-ss-ink">TikTok</strong>{" "}
                  can&apos;t receive API pushes yet, so for the TikTok flow map the
                  response field <Code>reply</Code> to a custom field and add a
                  Send Message step.
                </p>
                <p className="text-[12.5px] leading-relaxed text-ss-muted">
                  Reminder: Instagram and Facebook only accept an automated send
                  within{" "}
                  {PLATFORM_META.instagram.standardWindowHours} hours of the
                  lead&apos;s last message. Anything past that shows up in{" "}
                  <Link
                    href="/follow-ups"
                    className="font-semibold text-ss-indigo-600"
                  >
                    Follow-ups
                  </Link>{" "}
                  for you to send by hand.
                </p>
              </div>
            </SsCard>
          </>
        )}
    </>
  );
}

/**
 * The ranked gap list. Ordered by cost: a bot that can't send at all beats a bot
 * that answers badly, which beats a bot that hasn't been trained.
 */
function buildFixes(ctx: {
  id: string;
  kbCount: number;
  apiKeySet: boolean;
  isActive: boolean;
  liveChannels: number;
  deliveryFailures: number;
  trained: number;
}) {
  const out: {
    title: string;
    body: string;
    href: string;
    cta: string;
    urgent: boolean;
  }[] = [];

  if (!ctx.apiKeySet) {
    out.push({
      title: "No ManyChat key on this bot",
      body: "Replies are generated but never delivered. Add the key and they start going out on the next DM.",
      href: `/chatbots/${ctx.id}?tab=connection`,
      cta: "Add the key",
      urgent: true,
    });
  }
  if (!ctx.isActive) {
    out.push({
      title: "Auto-replies are switched off",
      body: "This bot won't answer anything until you turn it back on.",
      href: `/chatbots/${ctx.id}`,
      cta: "Turn it on",
      urgent: true,
    });
  }
  if (ctx.deliveryFailures > 0) {
    out.push({
      title: `${num(ctx.deliveryFailures)} sends bounced in the last 30 days`,
      body: "Most of these are threads that went past Instagram's 24-hour window. They're waiting in Follow-ups for a manual send.",
      href: "/follow-ups",
      cta: "Work the queue",
      urgent: true,
    });
  }
  if (ctx.kbCount < 6) {
    out.push({
      title:
        ctx.kbCount === 0
          ? "No knowledge entries yet"
          : `Only ${ctx.kbCount} knowledge ${ctx.kbCount === 1 ? "entry" : "entries"}`,
      body: "Bots with six or more entries go off-script about a third as often. Add pricing, timelines and refund rules first.",
      href: "/knowledge-base",
      cta: "Add entries",
      urgent: ctx.kbCount === 0,
    });
  }
  if (ctx.trained === 0) {
    out.push({
      title: "No trained scenarios yet",
      body: "Correct one reply in the sandbox and the bot keeps that answer for good.",
      href: `/chatbots/${ctx.id}?tab=training`,
      cta: "Open the trainer",
      urgent: false,
    });
  }
  if (out.length === 0) {
    out.push({
      title: "Nothing needs fixing",
      body: "Key connected, replies on, knowledge base filled out, and the sandbox has taught it at least one correction.",
      href: "/statistics",
      cta: "See how it's performing",
      urgent: false,
    });
  }
  return out.slice(0, 3);
}

/** "f980ca…a85ad" - enough to match against ManyChat, not enough to reuse. */
function maskSecret(secret: string | null | undefined): string {
  if (!secret || secret.length < 12) return "••••••";
  return `${secret.slice(0, 6)}…${secret.slice(-5)}`;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-[5px] bg-ss-chip px-1.5 py-0.5 font-mono text-[11.5px] text-ss-ink">
      {children}
    </code>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="ss-eyebrow mb-1.5 text-ss-muted">{label}</p>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-chip bg-ss-page px-3.5 py-3 font-mono text-[11.5px] leading-relaxed text-ss-ink">
        {value}
      </pre>
    </div>
  );
}

/**
 * The placeholder for a tab that's loading.
 *
 * Shaped per tab rather than one generic block: Overview is a navy strip over
 * two columns, the editor tabs are a tall single card, Connection is a stack of
 * short rows. A skeleton that showed the same thing for all seven would be
 * telling you the tab had changed while showing you it hadn't.
 */
function ChatbotTabSkeleton({ tab }: { tab: ChatbotTabKey }) {
  if (tab === "overview") {
    return (
      <>
        <Sk className="h-[74px] w-full rounded-card" tone="on-page" />
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <SkCard>
            <SkCardHead width="w-28" />
            <div className="mt-4 flex flex-col gap-2.5">
              {[0, 1, 2].map((i) => (
                <Sk key={i} className="h-[68px] w-full rounded-chip" />
              ))}
            </div>
          </SkCard>
          <SkCard>
            <SkCardHead width="w-36" />
            <div className="mt-4 flex flex-col gap-2.5">
              {[0, 1, 2].map((i) => (
                <Sk key={i} className="h-[86px] w-full rounded-chip" />
              ))}
            </div>
          </SkCard>
        </div>
      </>
    );
  }

  if (tab === "connection") {
    return (
      <SkCard className="p-6">
        <SkCardHead width="w-40" />
        <div className="mt-5 flex flex-col gap-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i}>
              <Sk className="h-[12px] w-32" />
              <Sk className="mt-2.5 h-[42px] w-full rounded-ctl-lg" />
            </div>
          ))}
        </div>
      </SkCard>
    );
  }

  // Prompt, Keywords, Training, Follow-ups, Media - all an editor surface.
  return (
    <SkCard className="p-6">
      <SkCardHead width="w-36" />
      <Sk className="mt-5 h-[320px] w-full rounded-ctl-lg" />
      <div className="mt-4 flex gap-2">
        <Sk className="h-[40px] w-32 rounded-ctl-lg" />
        <Sk className="h-[40px] w-28 rounded-ctl-lg" />
      </div>
    </SkCard>
  );
}
