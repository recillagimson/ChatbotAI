import Link from "next/link";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Phone,
  Plus,
  Sparkles,
  Zap,
} from "lucide-react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { getAnalyticsOverview, resolveRange } from "@/lib/analytics";
import { contactDisplayName } from "@/lib/contact";
import { CONVERSATION_TAGS, TAG_LABEL, tagOf } from "@/lib/conversation-tags";
import { SUPPORT_CONTACTS, SUPPORT_HOURS } from "@/lib/support-contacts";
import { botNameOf } from "@/lib/utils";
import { agoShort, longDate, num, splitDuration, tickDate } from "@/lib/format";
import { PageBody, PageHeader, PageShell, EmptyState } from "@/components/ss/page";
import { SsCard, SsCardHead, SsCardLink, SsIconTile } from "@/components/ss/card";
import {
  SsAvatar,
  SsDot,
  SsLinkButton,
  SsPill,
} from "@/components/ss/controls";
import { ChannelChip } from "@/components/ss/channel";
import { NavyPanel, PanelDivider, PanelEyebrow } from "@/components/ss/panel";
import { StatBlock } from "@/components/ss/stat";
import { AxisTicks, LegendRow, ProportionBar, Sparkbars } from "@/components/ss/charts";

export const dynamic = "force-dynamic";

/**
 * Overview - the design's home screen.
 *
 * Its central argument: "3 chatbots" isn't news. What is news is how fast leads
 * are being answered and who is waiting on a human right now. So the hero is
 * speed-to-lead, the first card is the queue that costs money when ignored, and
 * inventory (your chatbots) sits beside it rather than on top of it.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ bot?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const user = await getCurrentUser();
  const workspace = await getWorkspace(sp.bot ?? null);
  const botId = workspace?.scopedBotId ?? null;

  // Speed-to-lead over the last 7 days, against the 7 before it for the delta.
  const week = resolveRange({ range: "7d" });
  const prevTo = new Date(week.from);
  const prevFrom = new Date(prevTo.getTime() - 7 * 86_400_000);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [current, previous, { data: attention }, { count: repliesThisMonth }, { rows: tagRows }] =
    await Promise.all([
      getAnalyticsOverview(supabase, { from: week.from, to: week.to, chatbotId: botId }),
      getAnalyticsOverview(supabase, {
        from: prevFrom.toISOString(),
        to: prevTo.toISOString(),
        chatbotId: botId,
      }),
      // The queue: threads where the AI stepped back and a human should close.
      (() => {
        let q = supabase
          .from("conversations")
          .select("id, contact_name, contact_username, platform, last_message_at, chatbot_id, chatbots(name)")
          .eq("user_id", user!.id)
          .eq("tag", "needs_human")
          .order("last_message_at", { ascending: false })
          .limit(3);
        if (botId) q = q.eq("chatbot_id", botId);
        return q;
      })(),
      (() => {
        let q = supabase
          .from("usage_log")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user!.id)
          .eq("event_type", "ai_reply")
          .gte("created_at", monthStart.toISOString());
        if (botId) q = q.eq("chatbot_id", botId);
        return q;
      })(),
      // Paged: PostgREST silently caps at 1,000 rows, which would understate
      // the month's tag mix (and "new leads") on any busy workspace.
      fetchAllRows<{ tag: string | null }>(
        (from, to) => {
          let q = supabase
            .from("conversations")
            .select("tag")
            .eq("user_id", user!.id)
            .gte("last_message_at", monthStart.toISOString())
            .range(from, to);
          if (botId) q = q.eq("chatbot_id", botId);
          return q;
        },
        { label: "dashboard tag mix" }
      ),
    ]);

  // Last message per queued thread, for the one-line preview the design shows.
  const attentionIds = (attention ?? []).map((c) => c.id);
  const previews = new Map<string, string>();
  if (attentionIds.length) {
    const { data: msgs } = await supabase
      .from("messages")
      .select("conversation_id, content, created_at")
      .in("conversation_id", attentionIds)
      .order("created_at", { ascending: false })
      .limit(60);
    for (const m of msgs ?? []) {
      if (!previews.has(m.conversation_id)) previews.set(m.conversation_id, m.content);
    }
  }

  // A failed report is not the same as a quiet week. `unmeasured` keeps the hero
  // from announcing "no replies yet" when the truth is that the database never
  // answered - the one number on this screen someone would act on.
  const unmeasured = current.problem !== null;
  const median = current.overview?.response_time.median_secs ?? null;
  const prevMedian = previous.overview?.response_time.median_secs ?? null;
  const medianSplit = splitDuration(median);
  const deltaSecs =
    median != null && prevMedian != null ? Math.round(prevMedian - median) : null;

  const series = current.overview?.series ?? [];
  const seriesMax = Math.max(1, ...series.map((d) => d.conversations));
  const peak = Math.max(...series.map((d) => d.conversations), 0);

  const leadsThisMonth = (tagRows ?? []).filter(
    (r) => tagOf(r.tag) === "lead" || tagOf(r.tag) === "wants_call"
  ).length;

  const tagCounts = CONVERSATION_TAGS.map((t) => ({
    tag: t,
    label: TAG_LABEL[t],
    value: (tagRows ?? []).filter((r) => tagOf(r.tag) === t).length,
  })).filter((t) => t.value > 0 || t.tag === "lead");

  const bots = workspace?.bots ?? [];
  const setupDone =
    !!workspace?.subscriptionActive &&
    bots.length > 0 &&
    bots.some((b) => !b.unconnected);

  return (
    <PageShell>
      <PageHeader
        title="Overview"
        description={longDate()}
        actions={
          <SsLinkButton href="/conversations" variant="outline" size="md">
            Open the inbox
          </SsLinkButton>
        }
      />

      <PageBody>
        {/* ---- Setup strip ------------------------------------------------ */}
        <SetupStrip
          subscriptionActive={!!workspace?.subscriptionActive}
          hasBot={bots.length > 0}
          hasChannel={bots.some((b) => !b.unconnected)}
          done={setupDone}
        />

        {/* ---- Speed-to-lead hero ---------------------------------------- */}
        <NavyPanel gradient className="flex flex-col gap-6 px-7 py-6 xl:flex-row xl:gap-0">
          <div className="xl:w-[300px] xl:shrink-0">
            <PanelEyebrow icon={<Zap className="h-3.5 w-3.5" />}>
              Speed to lead · last 7 days
            </PanelEyebrow>
            <div className="mt-3 flex items-end gap-3">
              <div className="ss-num text-[54px] leading-none tracking-[-0.03em] text-white">
                {medianSplit ? (
                  <>
                    {medianSplit.value}
                    <span className="text-[26px] text-ss-indigo-300">
                      {medianSplit.unit}
                    </span>
                  </>
                ) : unmeasured ? (
                  <span className="text-[30px] text-ss-indigo-300">
                    Couldn&apos;t measure
                  </span>
                ) : (
                  <span className="text-[34px] text-ss-indigo-300">No replies yet</span>
                )}
              </div>
              {deltaSecs !== null && deltaSecs !== 0 && (
                <span
                  className={`mb-2 flex items-center gap-1 rounded-full px-2 py-1 ${
                    deltaSecs > 0 ? "bg-ss-mint/15" : "bg-ss-rose/20"
                  }`}
                >
                  {deltaSecs > 0 ? (
                    <ArrowDown className="h-3.5 w-3.5 text-ss-mint" aria-hidden="true" />
                  ) : (
                    <ArrowUp className="h-3.5 w-3.5 text-ss-rose-soft" aria-hidden="true" />
                  )}
                  <span
                    className={`font-display text-[11.5px] font-bold leading-none ${
                      deltaSecs > 0 ? "text-ss-mint" : "text-ss-rose-soft"
                    }`}
                  >
                    {Math.abs(deltaSecs)}s {deltaSecs > 0 ? "faster" : "slower"}
                  </span>
                </span>
              )}
            </div>
            <p className="mt-2 max-w-[19rem] text-[12.5px] leading-relaxed text-ss-nav-text">
              {unmeasured ? (
                <>
                  The database didn&apos;t return this report, so there is no
                  speed to show - not a slow week, an unanswered query.{" "}
                  <Link href="/statistics" className="underline">
                    Statistics
                  </Link>{" "}
                  says which of the two went wrong.
                </>
              ) : (
                <>
                  Median first reply across all channels. Leads answered inside
                  60 seconds convert roughly 3× more often.
                </>
              )}
            </p>
          </div>

          <div className="flex min-w-0 flex-1 flex-col justify-end xl:px-9">
            {series.length > 0 ? (
              <>
                <PanelEyebrow className="mb-3">Threads per day</PanelEyebrow>
                <Sparkbars
                  dark
                  data={series.map((d) => ({
                    v: d.conversations / seriesMax,
                    peak: peak > 0 && d.conversations === peak,
                  }))}
                />
                <AxisTicks
                  dark
                  labels={[
                    tickDate(series[0].day),
                    tickDate(series[Math.floor(series.length / 2)].day),
                    tickDate(series[series.length - 1].day),
                  ]}
                />
              </>
            ) : (
              <p className="text-[12.5px] leading-relaxed text-ss-nav-meta">
                No threads in the last 7 days - the chart fills in as DMs arrive.
              </p>
            )}
          </div>

          <PanelDivider className="hidden h-auto xl:block" />

          <div className="flex flex-wrap gap-6 xl:w-[216px] xl:shrink-0 xl:flex-col xl:justify-center xl:pl-7">
            <StatBlock
              dark
              label="New leads · this month"
              value={num(leadsThisMonth)}
            />
            <StatBlock
              dark
              label="Conversations"
              value={num(workspace?.counts.conversations ?? 0)}
              suffix="total threads"
            />
            <StatBlock
              dark
              label="AI replies sent"
              value={num(repliesThisMonth ?? 0)}
              suffix="this month"
            />
          </div>
        </NavyPanel>

        {/* ---- Queue + chatbots ------------------------------------------ */}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <SsCard className="flex flex-col shadow-ss-card">
            <div className="px-[22px] pb-3.5 pt-5">
              <SsCardHead
                icon={
                  <SsIconTile tone="rose">
                    <AlertCircle className="h-[17px] w-[17px]" aria-hidden="true" />
                  </SsIconTile>
                }
                title="Needs attention"
                description="The AI stepped back - a human should close these."
                action={
                  (workspace?.counts.needsAttention ?? 0) > 0 ? (
                    <span className="rounded-full bg-ss-rose px-2.5 py-1 font-display text-[11px] font-bold leading-none text-white">
                      {workspace!.counts.needsAttention} waiting
                    </span>
                  ) : (
                    <span className="rounded-full bg-ss-green-bg px-2.5 py-1 font-display text-[11px] font-bold leading-none text-ss-green-ink">
                      All clear
                    </span>
                  )
                }
              />
            </div>

            {(attention ?? []).length > 0 ? (
              <div className="flex flex-col px-3 pb-3">
                {(attention ?? []).map((c, i) => {
                  const name = contactDisplayName(c.contact_name, c.contact_username);
                  return (
                    <div key={c.id}>
                      {i > 0 && <div className="mx-2.5 h-px bg-ss-hair" aria-hidden="true" />}
                      <div className="flex items-center gap-3 rounded-chip px-2.5 py-3">
                        <SsAvatar name={name} size={36} tone="rose" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="truncate text-[13.5px] font-semibold leading-none text-ss-ink">
                              {name}
                            </span>
                            <ChannelChip platform={c.platform} />
                            <span className="text-[11px] font-medium leading-none text-ss-rose">
                              waiting · {agoShort(c.last_message_at)}
                            </span>
                          </div>
                          <p className="mt-1.5 truncate text-[12.5px] leading-snug text-ss-body">
                            {previews.get(c.id)?.trim() ||
                              `${botNameOf(c.chatbots) ?? "This bot"} paused on this thread.`}
                          </p>
                        </div>
                        <SsLinkButton
                          href={`/conversations/${c.id}`}
                          variant="primary"
                          size="sm"
                          className="shrink-0"
                        >
                          Take over
                        </SsLinkButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-[22px] pb-5">
                <EmptyState
                  icon={<CheckCircle2 className="h-6 w-6 text-ss-green" />}
                  title="Nothing is waiting on you"
                  variant="card"
                >
                  Threads land here the moment the AI decides a human should take
                  over - someone asking for a call, or a question it can&apos;t
                  answer from your knowledge base.
                </EmptyState>
              </div>
            )}

            <div className="mt-auto border-t border-ss-hair px-[22px] py-3.5">
              <SsCardLink href="/conversations?tag=needs_human">
                Open the full inbox →
              </SsCardLink>
            </div>
          </SsCard>

          <SsCard className="p-[22px] shadow-ss-card">
            <SsCardHead
              title="Your chatbots"
              action={
                <SsLinkButton href="/chatbots/new" variant="outline" size="sm">
                  <Plus className="h-[15px] w-[15px]" aria-hidden="true" />
                  New
                </SsLinkButton>
              }
              className="mb-4"
            />
            <div className="flex flex-col gap-2.5">
              {bots.length === 0 && (
                <EmptyState
                  title="No chatbot yet"
                  action={
                    <SsLinkButton href="/chatbots/new" variant="primary" size="sm">
                      Create your first chatbot
                    </SsLinkButton>
                  }
                >
                  One chatbot per business. It connects to Instagram, Facebook,
                  WhatsApp, Telegram and TikTok through ManyChat.
                </EmptyState>
              )}
              {bots.map((b) => (
                <div
                  key={b.id}
                  className={`rounded-[13px] border p-3.5 ${
                    b.unconnected
                      ? "border-ss-amber-line bg-ss-amber-tint"
                      : "border-ss-line bg-white"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <SsDot tone={b.unconnected ? "amber" : b.is_active ? "green" : "idle"} />
                    <span className="truncate text-[13.5px] font-semibold leading-none text-ss-ink">
                      {b.name}
                    </span>
                    <span className="ml-auto shrink-0 text-[11.5px] leading-none text-ss-muted">
                      {num(b.threads)} threads
                    </span>
                  </div>
                  {b.unconnected ? (
                    <>
                      <p className="mt-2 text-[11.5px] font-medium leading-snug text-ss-amber-ink">
                        No channel connected - replies aren&apos;t going out.
                      </p>
                      <SsLinkButton
                        href={`/chatbots/${b.id}`}
                        variant="navy"
                        size="sm"
                        className="mt-2.5"
                      >
                        Connect ManyChat
                      </SsLinkButton>
                    </>
                  ) : (
                    <div className="mt-2.5 flex items-center gap-1.5">
                      {b.platforms.map((p) => (
                        <ChannelChip key={p} platform={p} />
                      ))}
                      <SsCardLink href={`/chatbots/${b.id}`} className="ml-auto">
                        Manage
                      </SsCardLink>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </SsCard>
        </div>

        {/* ---- Tag mix + support ----------------------------------------- */}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <SsCard className="p-[22px] shadow-ss-card">
            <SsCardHead
              title="Where this month's threads landed"
              description="Tagged automatically by the AI, editable per thread."
              action={<SsCardLink href="/statistics">Statistics</SsCardLink>}
            />
            <ProportionBar
              className="mt-[18px]"
              segments={tagCounts.map((t) => ({ label: t.label, value: t.value }))}
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {tagCounts.map((t, i) => (
                <div key={t.tag}>
                  <div className="flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className={`h-2 w-2 shrink-0 rounded-[3px] ${TAG_SWATCH[i % TAG_SWATCH.length]}`}
                    />
                    <span className="truncate text-[11.5px] font-semibold leading-none text-ss-body">
                      {t.label}
                    </span>
                  </div>
                  <div className="ss-num mt-1.5 text-lg leading-none text-ss-ink">
                    {num(t.value)}
                  </div>
                </div>
              ))}
            </div>
            {(tagRows ?? []).length === 0 && (
              <p className="mt-4 text-[12px] leading-relaxed text-ss-muted">
                No threads yet this month. Tags fill in automatically as the AI
                classifies each conversation.
              </p>
            )}
          </SsCard>

          <SsCard className="p-[22px] shadow-ss-card">
            <SsCardHead
              title="Need a human?"
              description={`Tap to call or text the SpeedSettr team - ${SUPPORT_HOURS}.`}
            />
            <div className="mt-3.5 flex flex-col gap-2">
              {SUPPORT_CONTACTS.map((c) => (
                <a
                  key={c.tel}
                  href={`tel:${c.tel}`}
                  className="flex items-center gap-2.5 rounded-chip border border-ss-line px-3.5 py-3 transition-colors hover:border-ss-dash hover:bg-ss-page"
                >
                  <Phone className="h-[17px] w-[17px] shrink-0 text-ss-indigo-600" aria-hidden="true" />
                  <span className="text-[13px] font-semibold leading-none text-ss-ink">
                    @{c.name}
                  </span>
                  <span className="ml-auto text-[12.5px] font-semibold leading-none tabular-nums text-ss-indigo-600">
                    {c.phone}
                  </span>
                </a>
              ))}
              <Link
                href="/requests"
                className="flex items-center gap-2.5 rounded-chip bg-ss-indigo-50 px-3.5 py-3 text-[13px] font-semibold leading-none text-ss-indigo-700 transition-colors hover:bg-ss-indigo-100"
              >
                <Sparkles className="h-[17px] w-[17px] shrink-0" aria-hidden="true" />
                Request a change to your bot
              </Link>
            </div>
          </SsCard>
        </div>
      </PageBody>
    </PageShell>
  );
}

const TAG_SWATCH = [
  "bg-ss-indigo",
  "bg-ss-indigo-400",
  "bg-ss-indigo-250",
  "bg-ss-rose-soft",
  "bg-ss-rule",
];

/**
 * The setup checklist, which the design collapses to a single line the moment
 * all of it is done - a finished checklist that keeps taking up a card is just
 * noise on a screen you look at every morning.
 */
function SetupStrip({
  subscriptionActive,
  hasBot,
  hasChannel,
  done,
}: {
  subscriptionActive: boolean;
  hasBot: boolean;
  hasChannel: boolean;
  done: boolean;
}) {
  if (done) {
    return (
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-chip border border-ss-line bg-white px-4 py-3">
        <CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-ss-green" aria-hidden="true" />
        <span className="text-[13px] font-semibold leading-none text-ss-ink">
          Setup complete
        </span>
        <span className="text-[12.5px] leading-none text-ss-muted">
          Subscription, chatbot and a connected channel are all done.
        </span>
        <SsCardLink href="/settings" className="ml-auto">
          Review steps
        </SsCardLink>
      </div>
    );
  }

  const steps = [
    { done: subscriptionActive, label: "Activate your subscription", href: "/billing" },
    { done: hasBot, label: "Create your first chatbot", href: "/chatbots/new" },
    { done: hasChannel, label: "Connect ManyChat → Instagram", href: "/settings" },
  ];
  const left = steps.filter((s) => !s.done).length;

  return (
    <SsCard tone="indigo" className="p-[18px]">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="font-display text-[15px] font-bold leading-tight text-ss-ink">
          Finish setup
        </span>
        <span className="text-[12.5px] leading-none text-ss-body">
          {left} step{left === 1 ? "" : "s"} left before your AI replies go live.
        </span>
      </div>
      <div className="mt-3.5 flex flex-wrap gap-2">
        {steps.map((s) => (
          <SsPill
            key={s.href}
            href={s.href}
            tone={s.done ? undefined : "indigo"}
            active={!s.done}
          >
            {s.done ? "✓ " : ""}
            {s.label}
          </SsPill>
        ))}
      </div>
    </SsCard>
  );
}
