import Link from "next/link";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { BarChart3, MessageSquare, Reply, Bot, Timer } from "lucide-react";
import {
  resolveRange,
  getAnalyticsOverview,
  safePct,
  type RangeKey,
} from "@/lib/analytics";
import { StatsControlsBar } from "@/components/dashboard/stats/stats-controls-bar";
import { KpiStatCard } from "@/components/dashboard/stats/kpi-stat-card";
import { StatusSplit } from "@/components/dashboard/stats/status-split";

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

/** Derive a tone from reply rate percentage. */
function replyRateTone(
  pct: number | null
): "good" | "mid" | "bad" | "default" {
  if (pct === null) return "default";
  if (pct >= 50) return "good";
  if (pct >= 20) return "mid";
  return "bad";
}

export default async function StatisticsPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    from?: string;
    to?: string;
    bot?: string;
    tab?: string;
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
          {/* ── KPI strip — 5 cards, lg:grid-cols-5 ── */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
            {/* 1. Total Conversations */}
            <KpiStatCard
              label="Total Conversations"
              value={overview.funnel.entry ?? 0}
              sub="entry events"
              icon={MessageSquare}
            />

            {/* 2. Reply Rate — toned by threshold */}
            {(() => {
              const pct = safePct(
                overview.funnel.replied,
                overview.funnel.entry ?? 0
              );
              const replyDisplay =
                pct === null ? "—" : `${pct.toFixed(1)}%`;
              const tone = replyRateTone(pct);
              return (
                <KpiStatCard
                  label="Reply Rate"
                  value={replyDisplay}
                  sub="replied / entry"
                  icon={Reply}
                  tone={tone}
                />
              );
            })()}

            {/* 3. AI Replies */}
            <KpiStatCard
              label="AI Replies"
              value={overview.usage.ai_replies ?? 0}
              sub="messages sent"
              icon={Bot}
            />

            {/* 4. Avg messages / convo */}
            <KpiStatCard
              label="Avg msgs / convo"
              value={overview.messages.avg_per_convo ?? "—"}
              sub="per thread"
            />

            {/* 5. Avg first response */}
            <KpiStatCard
              label="Avg first response"
              value={formatSecs(overview.response_time.avg_secs)}
              sub="time to reply"
              icon={Timer}
            />
          </div>

          {/* ST4b: funnel + side KPI cards */}

          {/* ST4: Status split (full width, below funnel) */}
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
