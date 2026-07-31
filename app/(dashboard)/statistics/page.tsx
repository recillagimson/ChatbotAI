import { Suspense } from "react";
import Link from "next/link";
import {
  AlertCircle,
  BarChart3,
  Bot,
  Download,
  Forward,
  Info,
  Layers,
  MessagesSquare,
  Reply,
  SendHorizontal,
  Timer,
  TrendingUp,
} from "lucide-react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import {
  resolveRange,
  getAnalyticsOverview,
  getStageConversations,
  type AnalyticsProblem,
  type AnalyticsOverview,
  safePct,
  type RangeKey,
  type FunnelStage,
} from "@/lib/analytics";
import { getWorkspace } from "@/lib/workspace";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { contactDisplayName } from "@/lib/contact";
import { CONVERSATION_TAGS, TAG_LABEL, tagOf } from "@/lib/conversation-tags";
import {
  buildSequenceReport,
  sequenceInsight,
  type SequenceStats,
} from "@/lib/followup-sequences";
import { formatSecs, num, pct as fmtPct, shortDate, tickDate } from "@/lib/format";
import { StatsControlsBar } from "@/components/dashboard/stats/stats-controls-bar";
import { PageBody, PageHeader, PageShell, Callout, EmptyState } from "@/components/ss/page";
import { SsCard, SsCardHead, SsIconTile } from "@/components/ss/card";
import { SsLinkButton } from "@/components/ss/controls";
import { StatCard } from "@/components/ss/stat";
import {
  Sk,
  SkCard,
  SkCardHead,
  SkChart,
  SkStatCards,
} from "@/components/ss/skeleton";
import {
  AxisTicks,
  FunnelConnector,
  FunnelStep,
  GroupedBars,
  LegendRow,
  ProportionBar,
  YAxis,
} from "@/components/ss/charts";

export const dynamic = "force-dynamic";

/**
 * The funnel's four stages.
 *
 * The first three come from the `analytics_overview` RPC. `subscribed` is the
 * app's own conversion marker (`conversations.confirmed_at`, set by the webhook
 * and mirrored by the Subscribed tag) counted here in TypeScript, because the
 * RPC's stage list is fixed SQL. The design calls this stage "Booked a call" -
 * SpeedSettr has no booking integration, so it's named for what it actually
 * records rather than for what the mock-up wished it recorded.
 */
const STAGE_KEYS = ["entry", "replied", "link_sent", "subscribed"] as const;
type StageKey = (typeof STAGE_KEYS)[number];

const STAGE_LABEL: Record<StageKey, string> = {
  entry: "Conversations started",
  replied: "Bot replied",
  link_sent: "Link sent",
  subscribed: "Subscribed",
};

/**
 * What to say when the report doesn't come back. Three different causes with
 * three different fixes - telling someone to apply a migration that is already
 * applied sends them looking in the wrong place entirely.
 */
const ANALYTICS_PROBLEM: Record<
  AnalyticsProblem,
  { title: string; body: string }
> = {
  not_installed: {
    title: "Analytics aren't available yet",
    body: "The database analytics functions haven't been applied in Supabase yet. Once they are, the metrics, chart and funnel below fill in - nothing else needs changing.",
  },
  timed_out: {
    title: "This report timed out",
    body: "The analytics functions are installed, but the database gave up before finishing. A narrower date range sometimes gets through; if every range times out, the report itself needs tuning on the database - nothing you change on this page will fix it.",
  },
  failed: {
    title: "Couldn't load the report",
    body: "The database returned an error instead of the numbers. Nothing on this page is stale or wrong - it simply hasn't loaded. Try again, and if it persists the server log has the exact error.",
  },
};

/** Human label for the header subtitle. */
function rangeLabel(key: RangeKey, from?: string, to?: string): string {
  switch (key) {
    case "7d":
      return "Last 7 days";
    case "30d":
      return "Last 30 days";
    case "month":
      return "This month";
    case "lastmonth":
      return "Last month";
    case "all":
      return "All time";
    case "custom":
      return from && to ? `${from} – ${to}` : "Custom range";
  }
}

/**
 * Statistics - screen 7a: one page, in scroll order.
 *
 * Alert → metrics → activity → funnel (with the tag/status/queue column beside
 * it) → follow-up sequences. The design's argument is that a red number should
 * be an action and that the funnel is worth clicking into, so delivery failures
 * lead with somewhere to go and every funnel stage opens the threads inside it.
 *
 * Two deliberate departures from the mock-up, both because the data isn't there:
 * the sequence card reports how far the drip reached rather than replies per
 * step (nothing records which follow-up a lead answered), and the Conversation
 * phases card is absent entirely - phases are a concept from the LGF client
 * dashboard the design borrowed from, not something SpeedSettr tracks.
 *
 * The page is also built to survive a failed report: everything read straight
 * from the tables - tags, status, the manual queue, the sequences - still
 * renders when the analytics RPC times out, instead of the whole screen
 * collapsing to one error.
 */
type StatsParams = {
  range?: string;
  from?: string;
  to?: string;
  bot?: string;
  tab?: string;
  stage?: string;
  stage_n?: string;
};

/**
 * The shell: title, range controls, and a boundary around everything that has
 * to be fetched.
 *
 * Route-level `loading.tsx` only fires when the URL *segment* changes, and every
 * control on this page - the five date presets, the custom range, the chatbot
 * scope, clicking a funnel stage - only changes the query string. Without a
 * keyed boundary those clicks would sit on the old numbers with no feedback for
 * as long as the report takes. Keying the Suspense on the params makes React
 * throw the subtree away and show the skeleton the moment the URL changes.
 *
 * The header and the preset bar stay OUTSIDE the boundary on purpose: they cost
 * nothing to render, and keeping them mounted means the pill you just clicked is
 * already highlighted while the body is still loading.
 */
export default async function StatisticsPage({
  searchParams,
}: {
  searchParams: Promise<StatsParams>;
}) {
  const sp = await searchParams;
  const { rangeKey, customFrom, customTo } = resolveRange(sp);
  const workspace = await getWorkspace(sp.bot ?? null);
  const scopeName =
    workspace?.bots.find((b) => b.id === workspace?.scopedBotId)?.name ??
    "All chatbots";
  const hasBots = (workspace?.counts.chatbots ?? 0) > 0;

  // Every control that can change what the body shows.
  const reportKey = [sp.range, sp.from, sp.to, sp.bot, sp.stage, sp.stage_n].join("|");

  return (
    <PageShell>
      <PageHeader
        title="Statistics"
        description={`${rangeLabel(rangeKey, customFrom, customTo)} · ${scopeName}`}
        actions={
          <>
            <Suspense
              fallback={<Sk className="h-[38px] w-[124px] rounded-ctl-lg" tone="on-page" />}
            >
              <ExportButton sp={sp} />
            </Suspense>
            <SsLinkButton href="/follow-ups" variant="navy" size="md">
              <SendHorizontal className="h-4 w-4" aria-hidden="true" />
              Work the queue
            </SsLinkButton>
          </>
        }
      />

      <PageBody>
        {!hasBots ? (
          <EmptyState
            icon={<BarChart3 className="h-10 w-10" />}
            title="Create a chatbot to see statistics"
            action={
              <SsLinkButton href="/chatbots/new" variant="primary" size="md">
                <MessagesSquare className="h-4 w-4" aria-hidden="true" />
                Create a chatbot
              </SsLinkButton>
            }
          >
            Statistics appear once you have at least one chatbot with conversation
            history.
          </EmptyState>
        ) : (
          <>
            <StatsControlsBar
              rangeKey={rangeKey}
              customFrom={customFrom}
              customTo={customTo}
              comparison="Compared with the previous period of the same length"
            />
            <Suspense key={reportKey} fallback={<StatisticsReportSkeleton />}>
              <StatisticsReport sp={sp} />
            </Suspense>
          </>
        )}
      </PageBody>
    </PageShell>
  );
}

/**
 * The export button only exists when there's a report to export, so it has to
 * wait for the same read the body does - in its own small boundary, so it never
 * holds up the title.
 */
async function ExportButton({ sp }: { sp: StatsParams }) {
  const supabase = await createClient();
  const { from, to } = resolveRange(sp);
  const workspace = await getWorkspace(sp.bot ?? null);
  const { overview } = await getAnalyticsOverview(supabase, {
    from,
    to,
    chatbotId: workspace?.scopedBotId ?? null,
  });
  if (!overview) return null;

  const params = new URLSearchParams();
  for (const key of ["range", "from", "to", "bot"] as const) {
    if (sp[key]) params.set(key, sp[key] as string);
  }
  return (
    <SsLinkButton
      href={`/api/statistics/export?${params.toString()}`}
      variant="outline"
      size="md"
    >
      <Download className="h-4 w-4" aria-hidden="true" />
      Export CSV
    </SsLinkButton>
  );
}

/** Everything below the preset bar - the part that has to be fetched. */
async function StatisticsReport({ sp }: { sp: StatsParams }) {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const { from, to, rangeKey, customFrom, customTo } = resolveRange(sp);
  const workspace = await getWorkspace(sp.bot ?? null);
  const chatbotId = workspace?.scopedBotId ?? null;
  const { overview, problem } = await getAnalyticsOverview(supabase, {
    from,
    to,
    chatbotId,
  });

  // The previous window of the same length, for period-over-period deltas.
  const spanMs = new Date(to).getTime() - new Date(from).getTime();
  const { overview: prev } = await getAnalyticsOverview(supabase, {
    from: new Date(new Date(from).getTime() - spanMs).toISOString(),
    to: from,
    chatbotId,
  });

  const expandedStage: StageKey | null = STAGE_KEYS.includes(sp.stage as StageKey)
    ? (sp.stage as StageKey)
    : null;
  const stageN = Math.max(1, Math.min(100, Number(sp.stage_n) || 8));

  // One read of the in-scope threads backs the tag mix, the status split, and
  // the sequence reach - three cards that would otherwise be three queries.
  // Paged: PostgREST's silent 1,000-row cap would otherwise understate the tag
  // mix, the status split and the sequence reach on any busy period.
  const rowsQuery = fetchAllRows<{
    tag: string | null;
    status: string | null;
    chatbot_id: string;
    followup_step_index: number | null;
    link_sent_at: string | null;
  }>(
    (rFrom, rTo) => {
      let q = supabase
        .from("conversations")
        .select("tag, status, chatbot_id, followup_step_index, link_sent_at")
        .eq("user_id", user!.id)
        .gte("last_message_at", from)
        .lt("last_message_at", to)
        .range(rFrom, rTo);
      if (chatbotId) q = q.eq("chatbot_id", chatbotId);
      return q;
    },
    { label: "statistics conversations" }
  );

  // The 4th funnel stage. Keyed on created_at like the RPC's own stages, so it
  // stays a strict subset of "conversations started" - counting it by activity
  // instead would let the tip of the funnel exceed the stage above it.
  let subscribedQuery = supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user!.id)
    .not("confirmed_at", "is", null)
    .gte("created_at", from)
    .lt("created_at", to);
  if (chatbotId) subscribedQuery = subscribedQuery.eq("chatbot_id", chatbotId);

  let botsQuery = supabase
    .from("chatbots")
    .select("id, auto_followup_enabled, auto_followup_steps, auto_followup_link_steps")
    .eq("user_id", user!.id);
  if (chatbotId) botsQuery = botsQuery.eq("id", chatbotId);

  const [{ rows: scopedRows }, { count: subscribedCount }, { data: seqBots }] =
    await Promise.all([rowsQuery, subscribedQuery, botsQuery]);

  const rows = scopedRows;
  const sequences = buildSequenceReport(seqBots ?? [], rows);
  const insight = sequenceInsight(sequences);

  const funnel: Record<StageKey, number> | null = overview
    ? {
        entry: overview.funnel.entry,
        replied: overview.funnel.replied,
        link_sent: overview.funnel.link_sent,
        subscribed: subscribedCount ?? 0,
      }
    : null;

  const stageRows = expandedStage
    ? await loadStage(expandedStage, {
        supabase,
        userId: user!.id,
        from,
        to,
        chatbotId,
        limit: stageN,
      })
    : null;

  function makeHref(updates: Record<string, string | null>): string {
    const params = new URLSearchParams();
    for (const key of ["range", "from", "to", "bot", "stage", "stage_n"] as const) {
      const val = sp[key];
      if (val) params.set(key, val);
    }
    for (const [key, val] of Object.entries(updates)) {
      if (val === null) params.delete(key);
      else params.set(key, val);
    }
    const qs = params.toString();
    return qs ? `/statistics?${qs}` : "/statistics";
  }

  /** Same range and scope as the page, handed to the CSV route. */
  function exportHref(stage?: StageKey): string {
    const params = new URLSearchParams();
    for (const key of ["range", "from", "to", "bot"] as const) {
      const val = sp[key];
      if (val) params.set(key, val);
    }
    if (stage) params.set("stage", stage);
    return `/api/statistics/export?${params.toString()}`;
  }

  const tagCounts = CONVERSATION_TAGS.map((t) => ({
    tag: t,
    label: TAG_LABEL[t],
    value: rows.filter((r) => tagOf(r.tag) === t).length,
  })).filter((t) => t.value > 0);
  const disqualified = rows.filter((r) => tagOf(r.tag) === "disqualified").length;
  const manualQueue = workspace?.counts.followups ?? 0;

  return (
    <>

            {/* ---- The red number, as an action ------------------------- */}
            {overview && overview.usage.delivery_failures > 0 && (
              <Callout
                tone="rose"
                icon={
                  <SsIconTile tone="rose" size={34}>
                    <AlertCircle className="h-[19px] w-[19px]" aria-hidden="true" />
                  </SsIconTile>
                }
                title={`${num(overview.usage.delivery_failures)} replies never left ManyChat`}
                actions={
                  <>
                    <SsLinkButton
                      href="/learn/beat-the-24-hour-window"
                      variant="danger-outline"
                      size="md"
                    >
                      Why this happens
                    </SsLinkButton>
                    <SsLinkButton href="/follow-ups" variant="danger" size="md">
                      Send them by hand
                    </SsLinkButton>
                  </>
                }
              >
                {failureRate(overview.usage.delivery_failures, overview.usage.ai_replies)}{" "}
                of attempted sends in this period failed - most of them were
                outside Instagram&apos;s 24-hour messaging window.
              </Callout>
            )}

            {overview === null && (
              <Callout
                tone="amber"
                icon={<Info className="h-[18px] w-[18px] text-ss-amber" aria-hidden="true" />}
                title={ANALYTICS_PROBLEM[problem ?? "failed"].title}
              >
                {ANALYTICS_PROBLEM[problem ?? "failed"].body}
              </Callout>
            )}

            {/* ---- Metrics --------------------------------------------- */}
            {overview && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                <StatCard
                  label="Conversations"
                  icon={<MessagesSquare className="h-[17px] w-[17px]" aria-hidden="true" />}
                  value={num(overview.funnel.entry)}
                  delta={deltaLabel(overview.funnel.entry, prev?.funnel.entry)}
                  deltaTone={deltaTone(overview.funnel.entry, prev?.funnel.entry)}
                  foot={prev ? `${num(prev.funnel.entry)} last period` : "no prior period"}
                />
                <StatCard
                  label="AI replies"
                  icon={<Bot className="h-[17px] w-[17px]" aria-hidden="true" />}
                  value={num(overview.usage.ai_replies)}
                  delta={deltaLabel(overview.usage.ai_replies, prev?.usage.ai_replies)}
                  deltaTone={deltaTone(overview.usage.ai_replies, prev?.usage.ai_replies)}
                  foot={`${overview.messages.avg_per_convo.toFixed(1)} per thread`}
                />
                <StatCard
                  label="Reply rate"
                  icon={<Reply className="h-[17px] w-[17px]" aria-hidden="true" />}
                  value={fmtPct(safePct(overview.funnel.replied, overview.funnel.entry))}
                  valueTone="green"
                  foot={`${num(overview.funnel.replied)} of ${num(overview.funnel.entry)} threads`}
                />
                <StatCard
                  label="First response"
                  icon={<Timer className="h-[17px] w-[17px]" aria-hidden="true" />}
                  value={formatSecs(overview.response_time.median_secs)}
                  delta={secsDelta(
                    overview.response_time.median_secs,
                    prev?.response_time.median_secs ?? null
                  )}
                  deltaTone={
                    secsBetter(
                      overview.response_time.median_secs,
                      prev?.response_time.median_secs ?? null
                    )
                      ? "good"
                      : "bad"
                  }
                  foot="median, all channels"
                />
                <StatCard
                  label="Delivery failures"
                  tone={overview.usage.delivery_failures > 0 ? "rose" : "plain"}
                  valueTone={overview.usage.delivery_failures > 0 ? "rose" : "ink"}
                  value={num(overview.usage.delivery_failures)}
                  delta={
                    overview.usage.delivery_failures > 0
                      ? failureRate(
                          overview.usage.delivery_failures,
                          overview.usage.ai_replies
                        )
                      : undefined
                  }
                  deltaTone="bad"
                  foot={
                    overview.usage.delivery_failures > 0
                      ? "of attempted sends"
                      : "every send landed"
                  }
                />
              </div>
            )}

            {/* ---- Activity -------------------------------------------- */}
            {overview && (
              <SsCard className="p-[22px]">
                <SsCardHead
                  title="Activity over time"
                  description={
                    prev ? "Compared with the previous period of the same length" : undefined
                  }
                  action={
                    <div className="flex items-center gap-3.5">
                      <Legend color="bg-ss-indigo" label="Conversations" />
                      <Legend color="bg-ss-indigo-200" label="AI replies" />
                    </div>
                  }
                />
                {overview.series.length === 0 ? (
                  <p className="mt-4 text-[12px] leading-relaxed text-ss-muted">
                    No activity in this range.
                  </p>
                ) : (
                  <div className="mt-[18px] flex gap-3.5">
                    <YAxis
                      max={Math.max(
                        1,
                        ...overview.series.flatMap((d) => [d.conversations, d.ai_replies])
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <GroupedBars
                        data={overview.series.map((d) => ({
                          a: d.conversations,
                          b: d.ai_replies,
                        }))}
                      />
                      <AxisTicks labels={axisLabels(overview.series.map((d) => d.day))} />
                    </div>
                  </div>
                )}
              </SsCard>
            )}

            {/* ---- Funnel + side column -------------------------------- */}
            {/* `items-start` so each column sizes to its own content - without it
                a short funnel stretches to match the taller side column and
                renders as a mostly-empty box. */}
            <div className="grid items-start gap-[18px] xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
              <SsCard className="p-6">
                <SsCardHead
                  icon={
                    <SsIconTile tone="indigo" size={34}>
                      <TrendingUp className="h-[19px] w-[19px]" aria-hidden="true" />
                    </SsIconTile>
                  }
                  title="Inbound bot funnel"
                  description={
                    funnel ? "Click a stage to see who's in it" : undefined
                  }
                  action={
                    expandedStage && stageRows?.length ? (
                      <SsLinkButton
                        href={exportHref(expandedStage)}
                        variant="outline"
                        size="sm"
                      >
                        <Download className="h-4 w-4" aria-hidden="true" />
                        Export stage
                      </SsLinkButton>
                    ) : undefined
                  }
                />

                {!funnel ? (
                  <p className="mt-4 text-[12.5px] leading-relaxed text-ss-muted">
                    The funnel comes from the analytics report above, so it fills
                    in once that loads.
                  </p>
                ) : (
                  <>
                    <div className="mt-5 flex flex-col gap-[9px]">
                      {STAGE_KEYS.map((key, i) => {
                        const prevKey = STAGE_KEYS[i - 1];
                        const passed = prevKey
                          ? safePct(funnel[key], funnel[prevKey])
                          : null;
                        return (
                          <div key={key} className="contents">
                            {prevKey && (
                              <FunnelConnector
                                pct={fmtPct(passed)}
                                tone={passed != null && passed < 50 ? "amber" : "plain"}
                              />
                            )}
                            <FunnelStep
                              label={STAGE_LABEL[key]}
                              value={num(funnel[key])}
                              level={i as 0 | 1 | 2 | 3}
                              href={makeHref({
                                stage: expandedStage === key ? null : key,
                                stage_n: null,
                              })}
                              expanded={expandedStage === key}
                            >
                              <StageList
                                rows={stageRows}
                                total={funnel[key]}
                                moreHref={makeHref({ stage_n: String(stageN + 8) })}
                              />
                            </FunnelStep>
                          </div>
                        );
                      })}
                    </div>

                    {disqualified > 0 && (
                      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-panel border border-ss-rose-line bg-ss-rose-tint px-5 py-4">
                        <div>
                          <div className="text-[12px] font-semibold leading-none text-ss-rose-ink">
                            Disqualified leads
                          </div>
                          <div className="ss-num mt-2 text-[28px] leading-none text-ss-rose">
                            {num(disqualified)}
                          </div>
                        </div>
                        <p className="max-w-[19rem] text-[12.5px] leading-relaxed text-ss-rose-ink">
                          Tagged disqualified and out of play. They are still
                          counted in the stages above - the funnel measures how
                          far threads got, not how many were worth having.
                        </p>
                        <SsLinkButton
                          href="/conversations?tag=disqualified"
                          variant="danger-outline"
                          size="md"
                          className="ml-auto"
                        >
                          Review
                        </SsLinkButton>
                      </div>
                    )}

                    <p className="mt-4 border-t border-ss-hair pt-4 text-[12px] leading-relaxed text-ss-muted">
                      {biggestDrop(overview!.funnel)}
                    </p>
                  </>
                )}
              </SsCard>

              <div className="flex flex-col gap-[18px]">
                {/* Thread status */}
                <SsCard className="p-[22px]">
                  <SsCardHead title="Thread status" />
                  {(() => {
                    const split = {
                      active: rows.filter((r) => r.status === "active").length,
                      paused: rows.filter((r) => r.status === "ai_paused").length,
                      closed: rows.filter((r) => r.status === "closed").length,
                    };
                    if (!rows.length) {
                      return (
                        <p className="mt-3.5 text-[12px] leading-relaxed text-ss-muted">
                          No threads active in this range.
                        </p>
                      );
                    }
                    return (
                      <>
                        <ProportionBar
                          className="mt-4"
                          height={12}
                          segments={[
                            { label: "AI handling", value: split.active, color: "bg-ss-indigo" },
                            { label: "You took over", value: split.paused, color: "bg-ss-amber" },
                            { label: "Closed", value: split.closed, color: "bg-ss-rule" },
                          ]}
                        />
                        <div className="mt-3.5 flex flex-col gap-2.5">
                          <LegendRow
                            color="bg-ss-indigo"
                            label="AI handling"
                            value={num(split.active)}
                          />
                          <LegendRow
                            color="bg-ss-amber"
                            label="Paused - you took over"
                            value={num(split.paused)}
                          />
                          <LegendRow
                            color="bg-ss-rule"
                            label="Closed"
                            value={num(split.closed)}
                            dim
                          />
                        </div>
                      </>
                    );
                  })()}
                </SsCard>

                {/* Tag mix */}
                <SsCard className="p-[22px]">
                  <SsCardHead
                    title="Tags this period"
                    action={
                      <span className="text-[11.5px] leading-none text-ss-muted">
                        auto-applied
                      </span>
                    }
                  />
                  {tagCounts.length === 0 ? (
                    <p className="mt-3.5 text-[12px] leading-relaxed text-ss-muted">
                      No tagged threads in this range yet.
                    </p>
                  ) : (
                    <>
                      <ProportionBar
                        className="mt-4"
                        height={12}
                        segments={tagCounts.map((c, i) => ({
                          label: c.label,
                          value: c.value,
                          color: TAG_SWATCH[i % TAG_SWATCH.length],
                        }))}
                      />
                      <div className="mt-3.5 flex flex-col gap-2.5">
                        {tagCounts.map((c, i) => (
                          <LegendRow
                            key={c.tag}
                            color={TAG_SWATCH[i % TAG_SWATCH.length]}
                            label={c.label}
                            value={num(c.value)}
                            dim={c.tag === "bot" || c.tag === "disqualified"}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </SsCard>

                {/* The queue - the design's amber "needs a nudge" card. */}
                <SsCard tone="amber" className="p-[22px]">
                  <div className="flex items-center gap-2.5">
                    <SendHorizontal
                      className="h-[18px] w-[18px] shrink-0 text-ss-amber"
                      aria-hidden="true"
                    />
                    <div className="font-display text-[14.5px] font-bold leading-tight text-ss-ink">
                      {manualQueue > 0
                        ? `${num(manualQueue)} need a manual nudge`
                        : "Nothing needs a manual nudge"}
                    </div>
                  </div>
                  <p className="mt-2.5 text-[12px] leading-relaxed text-ss-amber-ink">
                    {manualQueue > 0
                      ? "Qualified threads that crossed the 24-hour window. The bot can't reach them - you can, for up to seven days."
                      : "Every live thread is still inside a window the bot can reach on its own."}
                  </p>
                  <SsLinkButton
                    href="/follow-ups"
                    variant={manualQueue > 0 ? "navy" : "outline"}
                    size="md"
                    className="mt-3.5"
                  >
                    Open the queue
                  </SsLinkButton>
                </SsCard>
              </div>
            </div>

            {/* ---- Follow-up sequences --------------------------------- */}
            <SsCard className="p-6">
              <SsCardHead
                icon={
                  <SsIconTile tone="indigo" size={34}>
                    <Forward className="h-[19px] w-[19px]" aria-hidden="true" />
                  </SsIconTile>
                }
                title="Follow-up sequences"
                description={sequenceSubtitle(sequences.preLink, sequences.postLink)}
                action={
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`rounded-full px-2.5 py-1.5 text-[11px] font-bold leading-[1.5] ${
                        sequences.enabled
                          ? "bg-ss-green-bg text-ss-green-ink"
                          : "bg-ss-amber-bg text-ss-amber-ink"
                      }`}
                    >
                      {sequences.enabled ? "DRIP ON" : "DRIP OFF"}
                    </span>
                    <SsLinkButton href="/chatbots" variant="outline" size="sm">
                      Edit sequence
                    </SsLinkButton>
                  </div>
                }
              />

              {!sequences.preLink.length && !sequences.postLink.length ? (
                <p className="mt-4 text-[12.5px] leading-relaxed text-ss-muted">
                  No follow-up steps are configured on{" "}
                  {chatbotId ? "this chatbot" : "any chatbot"} yet, so a thread
                  that goes quiet stays quiet. Steps are set per chatbot on its
                  Follow-ups tab.
                </p>
              ) : (
                <>
                  <div className="mt-5 grid gap-[22px] lg:grid-cols-2">
                    <SequenceColumn
                      title="Pre-link follow-ups"
                      hint="before the offer goes out"
                      stats={sequences.preLink}
                    />
                    <SequenceColumn
                      title="Post-link follow-ups"
                      hint="after the link has been sent"
                      stats={sequences.postLink}
                    />
                  </div>

                  {insight && (
                    <div className="mt-[18px] flex flex-wrap items-center gap-3.5 rounded-panel border border-ss-rule-indigo bg-ss-indigo-25 px-[18px] py-4">
                      <Layers
                        className="h-[18px] w-[18px] shrink-0 text-ss-indigo-600"
                        aria-hidden="true"
                      />
                      <p className="min-w-[16rem] flex-1 text-[12.5px] leading-relaxed text-ss-indigo-800">
                        {insight}
                      </p>
                    </div>
                  )}

                  <p className="mt-4 border-t border-ss-hair pt-4 text-[12px] leading-relaxed text-ss-muted">
                    Reach only. Nothing records which follow-up a lead answered -
                    there&apos;s one timestamp per thread, not one per send - so
                    a reply-per-step rate would be invented rather than measured.
                    {sequences.mixed
                      ? " Steps are also summed across chatbots here, and step 3 isn't the same message on every bot."
                      : ""}
                  </p>
                </>
              )}
            </SsCard>

            {/* One honest line, not a card of invented numbers. */}
            <EmptyState
              variant="inline"
              icon={<Layers className="h-[17px] w-[17px] text-ss-muted" />}
              title="Conversation phases & A/B variants"
            >
              Not instrumented. The design shows leads moving through named script
              phases - SpeedSettr doesn&apos;t record one, so there is nothing
              behind that card yet. It comes back when the bot writes a phase per
              thread.
            </EmptyState>
    </>
  );
}

const TAG_SWATCH = [
  "bg-ss-indigo",
  "bg-ss-indigo-400",
  "bg-ss-indigo-250",
  "bg-ss-rose-soft",
  "bg-ss-rule",
  "bg-ss-mint-soft",
  "bg-ss-amber-soft",
];

/** The contacts inside one funnel stage, rendered under the stage row. */
function StageList({
  rows,
  total,
  moreHref,
}: {
  rows: { id: string; name: string; date: string }[] | null;
  total: number;
  moreHref: string;
}) {
  if (!rows) return null;
  if (rows.length === 0) {
    return (
      <p className="mt-[7px] rounded-chip border border-ss-rule bg-white px-4 py-3 text-[12px] text-ss-muted">
        No threads reached this stage in this period.
      </p>
    );
  }
  return (
    <div className="mt-[7px] overflow-hidden rounded-chip border border-ss-rule bg-white shadow-ss-pop">
      <div className="ss-scroll max-h-[196px] overflow-auto">
        {rows.map((r, i) => (
          <Link
            key={r.id}
            href={`/conversations/${r.id}`}
            className={`flex items-center gap-2.5 px-[15px] py-3 transition-colors hover:bg-ss-page ${
              i > 0 ? "border-t border-ss-hair-2" : ""
            }`}
          >
            <span className="truncate text-[12.5px] font-semibold leading-none text-ss-ink">
              {r.name}
            </span>
            <span className="ml-auto shrink-0 text-[11.5px] leading-none text-ss-muted">
              {shortDate(r.date)}
            </span>
          </Link>
        ))}
      </div>
      {total > rows.length && (
        <Link
          href={moreHref}
          className="flex items-center gap-2 border-t border-ss-hair bg-ss-page-alt px-[15px] py-3 text-[12px] font-semibold text-ss-indigo-600"
        >
          Load more
          <span className="font-normal text-ss-muted">
            ({rows.length} of {num(total)})
          </span>
        </Link>
      )}
    </div>
  );
}

/** One side of the sequence card: a step per configured drip message. */
function SequenceColumn({
  title,
  hint,
  stats,
}: {
  title: string;
  hint: string;
  stats: SequenceStats;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2.5 pb-3">
        <span className="font-display text-[14px] font-bold leading-tight text-ss-ink">
          {title}
        </span>
        <span className="text-[11.5px] leading-none text-ss-muted">{hint}</span>
      </div>

      {stats.length === 0 ? (
        <p className="rounded-ctl-lg border border-dashed border-ss-dash bg-ss-page-alt px-4 py-3.5 text-[12px] leading-relaxed text-ss-muted">
          No steps configured, so this half of the drip never runs.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {stats.steps.map((s) => (
            <div
              key={s.step}
              className={`rounded-panel border px-[17px] py-[15px] ${
                s.dead ? "border-ss-hair bg-ss-page-alt" : "border-ss-line bg-white"
              }`}
            >
              <div className="flex items-baseline gap-2.5">
                <span
                  className={`text-[11.5px] font-medium leading-none ${
                    s.dead ? "text-ss-muted" : "text-ss-body"
                  }`}
                >
                  Step {s.step}
                </span>
                <span
                  className={`ml-auto ss-num text-[26px] leading-none ${
                    s.dead ? "text-ss-faint" : "text-ss-ink"
                  }`}
                >
                  {num(s.reached)}
                </span>
                <span className="text-[11.5px] leading-none text-ss-muted">
                  reached
                </span>
              </div>
              <div
                className={`mt-3 rounded-[9px] px-2 py-2 text-center text-[11.5px] font-bold leading-tight text-white ${reachTone(
                  s.shareOfFirst,
                  s.dead
                )}`}
              >
                {s.shareOfFirst == null
                  ? "no threads entered"
                  : `${fmtPct(s.shareOfFirst)} of step 1`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Green while most of the entrants are still here, rose once nobody is. */
function reachTone(share: number | null, dead: boolean): string {
  if (dead || share === 0) return "bg-ss-rose-soft";
  if (share == null) return "bg-ss-dash";
  if (share >= 60) return "bg-ss-green";
  if (share >= 25) return "bg-ss-amber";
  return "bg-[#ea8009]";
}

function sequenceSubtitle(pre: SequenceStats, post: SequenceStats): string {
  if (!pre.length && !post.length) return "Not configured yet.";
  const bits: string[] = [];
  if (pre.length) bits.push(`${pre.length} before the link`);
  if (post.length) bits.push(`${post.length} after it`);
  return `${bits.join(", ")} - how far down each one threads actually got.`;
}

/**
 * Load the contacts in one funnel stage. The first three come from the RPC that
 * already backs the funnel; `subscribed` is counted here, so it's listed here
 * too, on the same created_at basis the stage count uses.
 */
async function loadStage(
  stage: StageKey,
  opts: {
    supabase: Awaited<ReturnType<typeof createClient>>;
    userId: string;
    from: string;
    to: string;
    chatbotId: string | null;
    limit: number;
  }
): Promise<{ id: string; name: string; date: string }[]> {
  const { supabase, userId, from, to, chatbotId, limit } = opts;

  if (stage !== "subscribed") {
    const list = await getStageConversations(supabase, {
      stage: stage as FunnelStage,
      from,
      to,
      chatbotId,
      limit,
    });
    return list.map((r) => ({
      id: r.id,
      name: contactDisplayName(r.contact_name, r.contact_username),
      date: r.created_at,
    }));
  }

  let q = supabase
    .from("conversations")
    .select("id, contact_name, contact_username, created_at")
    .eq("user_id", userId)
    .not("confirmed_at", "is", null)
    .gte("created_at", from)
    .lt("created_at", to)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (chatbotId) q = q.eq("chatbot_id", chatbotId);
  const { data } = await q;
  return (data ?? []).map((r) => ({
    id: r.id,
    name: contactDisplayName(r.contact_name, r.contact_username),
    date: r.created_at,
  }));
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11.5px] font-medium leading-none text-ss-body">
      <span
        aria-hidden="true"
        className={`h-[9px] w-[9px] shrink-0 rounded-[3px] ${color}`}
      />
      {label}
    </span>
  );
}

function deltaLabel(now: number, before?: number): string | undefined {
  if (before == null || before === 0) return undefined;
  const change = Math.round(((now - before) / before) * 100);
  if (change === 0) return undefined;
  return `${change > 0 ? "+" : "−"}${Math.abs(change)}%`;
}

function deltaTone(now: number, before?: number): "good" | "bad" | undefined {
  if (before == null || before === 0) return undefined;
  return now >= before ? "good" : "bad";
}

function secsDelta(now: number | null, before: number | null): string | undefined {
  if (now == null || before == null) return undefined;
  const diff = Math.round(before - now);
  if (diff === 0) return undefined;
  return `${diff > 0 ? "−" : "+"}${Math.abs(diff)}s`;
}

/** Faster is better for response time, so a drop is the good direction. */
function secsBetter(now: number | null, before: number | null): boolean {
  if (now == null || before == null) return true;
  return now <= before;
}

function failureRate(failures: number, replies: number): string {
  if (!replies) return `${num(failures)} sends`;
  return fmtPct((failures / (replies + failures)) * 100);
}

/** The one sentence the funnel is for. */
function biggestDrop(f: AnalyticsOverview["funnel"]): string {
  if (!f.entry) return "No threads in this period yet.";
  const replyLoss = f.entry - f.replied;
  const linkLoss = f.replied - f.link_sent;
  if (linkLoss >= replyLoss) {
    return `Biggest drop: replied → link sent. ${num(linkLoss)} thread${linkLoss === 1 ? "" : "s"} got an answer and never got an offer - that's the one number worth moving. A keyword trigger for "price" and a knowledge entry that answers pricing directly are the two changes that move it most.`;
  }
  return `Biggest drop: started → replied. ${num(replyLoss)} thread${replyLoss === 1 ? "" : "s"} never got an answer at all, which usually means delivery is failing rather than the AI declining to reply.`;
}

/** Three evenly spaced ticks across the series. */
function axisLabels(days: string[]): string[] {
  if (days.length === 0) return [];
  if (days.length <= 3) return days.map(tickDate);
  return [
    tickDate(days[0]),
    tickDate(days[Math.floor(days.length / 2)]),
    tickDate(days[days.length - 1]),
  ];
}

/**
 * What the body looks like while it's being fetched.
 *
 * Deliberately the same shapes and grid as the real report - five metric tiles,
 * a chart at the same height, the funnel's tapering stack at its real insets -
 * so the page doesn't resize under the cursor when the numbers land. This is the
 * in-page twin of `loading.tsx`, which only covers arriving at the route.
 */
function StatisticsReportSkeleton() {
  return (
    <>
      <SkStatCards count={5} />
      <SkChart bars={26} />
      <div className="grid items-start gap-[18px] xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <SkCard className="p-6">
          <SkCardHead />
          <div className="mt-5 flex flex-col gap-[9px]">
            <Sk className="h-[52px] w-full rounded-[12px]" />
            <div className="flex justify-center">
              <Sk className="h-[24px] w-16 rounded-full" />
            </div>
            <div className="pl-10 pr-[26px]">
              <Sk className="h-[52px] w-full rounded-[12px]" />
            </div>
            <div className="flex justify-center">
              <Sk className="h-[24px] w-16 rounded-full" />
            </div>
            <div className="pl-[74px] pr-[52px]">
              <Sk className="h-[52px] w-full rounded-[12px]" />
            </div>
            <div className="flex justify-center">
              <Sk className="h-[24px] w-16 rounded-full" />
            </div>
            <div className="pl-[108px] pr-[78px]">
              <Sk className="h-[52px] w-full rounded-[12px]" />
            </div>
          </div>
        </SkCard>
        <div className="flex flex-col gap-[18px]">
          {[0, 1].map((i) => (
            <SkCard key={i}>
              <Sk className="h-[15px] w-32" />
              <Sk className="mt-4 h-3 w-full rounded-full" />
              <div className="mt-4 flex flex-col gap-2.5">
                <Sk className="h-[12px] w-full" />
                <Sk className="h-[12px] w-full" />
                <Sk className="h-[12px] w-3/4" />
              </div>
            </SkCard>
          ))}
          <SkCard>
            <Sk className="h-[15px] w-40" />
            <Sk className="mt-3 h-[12px] w-full" />
            <Sk className="mt-3.5 h-[38px] w-36 rounded-ctl-lg" />
          </SkCard>
        </div>
      </div>
      <SkCard className="p-6">
        <SkCardHead width="w-48" />
        <div className="mt-5 grid gap-[22px] lg:grid-cols-2">
          {[0, 1].map((col) => (
            <div key={col}>
              <Sk className="h-[14px] w-40" />
              <div className="mt-3 flex flex-col gap-2.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="rounded-panel border border-ss-line px-[17px] py-[15px]"
                  >
                    <div className="flex items-baseline gap-2.5">
                      <Sk className="h-[11px] w-14" />
                      <Sk className="ml-auto h-[26px] w-16" />
                    </div>
                    <Sk className="mt-3 h-[30px] w-full rounded-[9px]" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SkCard>
    </>
  );
}
