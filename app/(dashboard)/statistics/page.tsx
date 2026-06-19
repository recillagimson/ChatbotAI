import Link from "next/link";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { BarChart3, MessageSquare, Bot, Timer, AlertTriangle } from "lucide-react";
import {
  resolveRange,
  getAnalyticsOverview,
  getStageConversations,
  safePct,
  type RangeKey,
  type FunnelStage,
} from "@/lib/analytics";
import { StatsControlsBar } from "@/components/dashboard/stats/stats-controls-bar";
import { KpiStatCard } from "@/components/dashboard/stats/kpi-stat-card";
import { StatusSplit } from "@/components/dashboard/stats/status-split";
import { Funnel } from "@/components/dashboard/stats/funnel";

export const dynamic = "force-dynamic";

/** Map a RangeKey to a human-readable label for the header subtitle. */
function rangeLabel(
  key: RangeKey,
  customFrom?: string,
  customTo?: string
): string {
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
      return customFrom && customTo ? `${customFrom} – ${customTo}` : "Custom range";
  }
}

/** Format avg_secs as "Ns" / "Nm" / "Nh", or "—" when null. */
function formatSecs(secs: number | null): string {
  if (secs === null) return "—";
  if (secs < 60) return `${Math.round(secs)}s`;
  if (secs < 3600) return `${Math.round(secs / 60)}m`;
  return `${Math.round(secs / 3600)}h`;
}

/** Derive a tone from a percentage. */
function pctTone(pct: number | null): "good" | "mid" | "bad" | "default" {
  if (pct === null) return "default";
  if (pct >= 50) return "good";
  if (pct >= 20) return "mid";
  return "bad";
}

const VALID_STAGES: readonly FunnelStage[] = ["entry", "replied", "link_sent"] as const;

export default async function StatisticsPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    from?: string;
    to?: string;
    bot?: string;
    tab?: string;
    stage?: string;
    stage_n?: string;
  }>;
}) {
  const sp = await searchParams;

  const supabase = await createClient();
  const user = await getCurrentUser();

  const { from, to, rangeKey, customFrom, customTo } = resolveRange(sp);

  // Fetch chatbots — explicit columns only, NEVER select *
  const { data: chatbots } = await supabase
    .from("chatbots")
    .select("id, name")
    .eq("user_id", user!.id)
    .order("created_at");

  // Validate the ?bot param against the user's actual chatbots
  const chatbotId =
    sp.bot && chatbots?.some((c) => c.id === sp.bot) ? sp.bot : null;

  // Resolve the selected bot's display name for the subtitle
  const selectedBotName = chatbotId
    ? (chatbots?.find((c) => c.id === chatbotId)?.name ?? "Unknown bot")
    : "All chatbots";

  const overview = await getAnalyticsOverview(supabase, { from, to, chatbotId });

  const label = rangeLabel(rangeKey, customFrom, customTo);

  // ── Expansion state ─────────────────────────────────────────────────────────
  const expandedStage: FunnelStage | null = VALID_STAGES.includes(
    sp.stage as FunnelStage
  )
    ? (sp.stage as FunnelStage)
    : null;

  const stageN = Math.max(1, Math.min(100, Number(sp.stage_n) || 8));

  // Fetch conversations for the expanded stage (if any)
  const stageRows =
    expandedStage && overview
      ? await getStageConversations(supabase, {
          stage: expandedStage,
          from,
          to,
          chatbotId,
          limit: stageN,
        })
      : null;

  const stageTotal = stageRows?.[0]?.total ?? 0;
  const stageShown = stageRows?.length ?? 0;

  // ── makeHref helper ─────────────────────────────────────────────────────────
  /**
   * Build a /statistics href from current search params, applying overrides.
   * Pass null for a key to delete it from the query string.
   */
  function makeHref(updates: Record<string, string | null>): string {
    const params = new URLSearchParams();

    // Seed with relevant current params
    const seeds: (keyof typeof sp)[] = [
      "range",
      "from",
      "to",
      "bot",
      "tab",
      "stage",
      "stage_n",
    ];
    for (const key of seeds) {
      const val = sp[key];
      if (val) params.set(key, val);
    }

    // Apply overrides
    for (const [key, val] of Object.entries(updates)) {
      if (val === null) {
        params.delete(key);
      } else {
        params.set(key, val);
      }
    }

    const qs = params.toString();
    return qs ? `/statistics?${qs}` : "/statistics";
  }

  // ── Funnel stages definition ────────────────────────────────────────────────
  const funnelStages = overview
    ? [
        {
          key: "entry",
          label: "Conversations (entry)",
          count: overview.funnel.entry,
          real: true,
        },
        {
          key: "replied",
          label: "Replied",
          count: overview.funnel.replied,
          real: true,
        },
        {
          key: "link_sent",
          label: "Link sent",
          count: overview.funnel.link_sent,
          real: true,
        },
        {
          key: "booked",
          label: "Booked",
          count: null,
          real: false,
        },
      ]
    : [];

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* ── Page header ── */}
      <div className="mb-6">
        <h1 className="text-3xl font-display font-semibold tracking-tight">
          Statistics
        </h1>
        <p className="text-muted-foreground">
          {label} &mdash; {selectedBotName}
        </p>
      </div>

      {/* ── Controls bar — shown whenever chatbots exist (even when overview is null) ── */}
      {!!chatbots?.length && (
        <StatsControlsBar
          rangeKey={rangeKey}
          customFrom={customFrom}
          customTo={customTo}
          bot={chatbotId}
          tab={sp.tab ?? "funnel"}
          chatbots={chatbots ?? []}
        />
      )}

      {/* ── Empty state: no chatbots yet ── */}
      {!chatbots?.length && (
        <Card>
          <CardContent className="py-16 text-center">
            <BarChart3
              className="h-12 w-12 mx-auto text-muted-foreground mb-4"
              aria-hidden
            />
            <p className="font-medium mb-1">Create a chatbot to see statistics</p>
            <p className="text-sm text-muted-foreground mb-6">
              Statistics appear once you have at least one chatbot with
              conversation history.
            </p>
            <Link
              href="/chatbots"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MessageSquare className="h-4 w-4" />
              Go to Chatbots
            </Link>
          </CardContent>
        </Card>
      )}

      {/* ── Analytics not yet available (RPC not applied) ── */}
      {!!chatbots?.length && overview === null && (
        <Card className="border-amber-400/60 bg-amber-50 dark:bg-amber-950/20">
          <CardHeader>
            <CardTitle className="text-base text-amber-800 dark:text-amber-300">
              Analytics aren&apos;t available yet
            </CardTitle>
            <CardDescription className="text-amber-700 dark:text-amber-400">
              Once the database analytics functions are applied in Supabase, your
              stats will appear here. This is expected until the owner applies the
              analytics SQL migrations.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* ── Main content: KPI strip + slots ── */}
      {!!chatbots?.length && overview !== null && (
        <>
          {/* ── KPI strip — 4 cards (Reply Rate + Total Conversations moved to funnel column) ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {/* 1. AI Replies */}
            <KpiStatCard
              label="AI Replies"
              value={overview.usage.ai_replies ?? 0}
              sub="messages sent"
              icon={Bot}
            />

            {/* 2. Avg messages / convo */}
            <KpiStatCard
              label="Avg msgs / convo"
              value={overview.messages.avg_per_convo ?? 0}
              sub="per thread"
            />

            {/* 3. Avg first response */}
            <KpiStatCard
              label="Avg first response"
              value={formatSecs(overview.response_time.avg_secs)}
              sub="time to reply"
              icon={Timer}
            />

            {/* 4. Delivery health (new — replaces Reply Rate + Total Convos in strip) */}
            {(() => {
              const failures = overview.usage.delivery_failures ?? 0;
              return (
                <KpiStatCard
                  label="Delivery health"
                  value={failures === 0 ? "Healthy" : `${failures} failure${failures !== 1 ? "s" : ""}`}
                  sub="push failures"
                  icon={AlertTriangle}
                  tone={failures > 0 ? "bad" : "good"}
                />
              );
            })()}
          </div>

          {/* ── ST4b: Funnel (2/3 width) + side KPI cards (1/3 width) ── */}
          <div className="grid lg:grid-cols-3 gap-6 mb-8">
            {/* Left 2 cols: conversation funnel */}
            <div className="lg:col-span-2">
              <Funnel
                stages={funnelStages}
                expandedStage={expandedStage}
                stageRows={stageRows}
                stageTotal={stageTotal}
                stageShown={stageShown}
                makeHref={makeHref}
              />
            </div>

            {/* Right 1 col: funnel-related KPI cards */}
            <div className="flex flex-col gap-4">
              {/* Booking Rate — stub (not tracked) */}
              <KpiStatCard
                label="Booking Rate"
                value="—"
                sub="booked / entry"
                stub
              />

              {/* Reply Rate — real, moved from top strip */}
              {(() => {
                const pct = safePct(
                  overview.funnel.replied,
                  overview.funnel.entry ?? 0
                );
                const display = pct === null ? "—" : `${pct.toFixed(1)}%`;
                return (
                  <KpiStatCard
                    label="Reply Rate"
                    value={display}
                    sub="replied / entry"
                    tone={pctTone(pct)}
                  />
                );
              })()}

              {/* Total Conversations — real, moved from top strip */}
              <KpiStatCard
                label="Total Conversations"
                value={overview.funnel.entry ?? 0}
                sub="entry events"
                icon={MessageSquare}
              />
            </div>
          </div>

          {/* ── ST4: Status split (full width, below funnel) ── */}
          <div className="mb-8">
            <StatusSplit
              active={overview.status_split.active}
              aiPaused={overview.status_split.ai_paused}
              closed={overview.status_split.closed}
            />
          </div>

          {/* ST5: trend chart + Events view */}

          {/* ST6: phases, follow-up sequences, disqualified callout (stubs) */}
        </>
      )}
    </div>
  );
}
