import Link from "next/link";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { BarChart3, MessageSquare } from "lucide-react";
import {
  resolveRange,
  getAnalyticsOverview,
  safePct,
  type RangeKey,
} from "@/lib/analytics";

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
      <div className="mb-8">
        <h1 className="text-3xl font-display font-semibold tracking-tight">
          Statistics
        </h1>
        <p className="text-muted-foreground">
          {label} &mdash; {selectedBotName}
        </p>
      </div>

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
      {chatbots?.length && overview === null && (
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
      {chatbots?.length && overview !== null && (
        <>
          {/* ── KPI strip ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {/* 1. Total Conversations */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Conversations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-display font-semibold tabular-nums">
                  {overview.funnel.entry}
                </div>
                <p className="text-xs text-muted-foreground">entry events</p>
              </CardContent>
            </Card>

            {/* 2. Reply Rate */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Reply Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-display font-semibold tabular-nums">
                  {(() => {
                    const pct = safePct(
                      overview.funnel.replied,
                      overview.funnel.entry
                    );
                    return pct === null ? "—" : `${pct.toFixed(1)}%`;
                  })()}
                </div>
                <p className="text-xs text-muted-foreground">
                  replied&thinsp;/&thinsp;entry
                </p>
              </CardContent>
            </Card>

            {/* 3. AI Replies */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">AI Replies</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-display font-semibold tabular-nums">
                  {overview.usage.ai_replies}
                </div>
                <p className="text-xs text-muted-foreground">messages sent</p>
              </CardContent>
            </Card>

            {/* 4. Avg messages / convo */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Avg msgs&thinsp;/&thinsp;convo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-display font-semibold tabular-nums">
                  {overview.messages.avg_per_convo}
                </div>
                <p className="text-xs text-muted-foreground">per thread</p>
              </CardContent>
            </Card>

            {/* 5. Avg first response (wraps to next row on 4-col grid) */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Avg first response
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-display font-semibold tabular-nums">
                  {formatSecs(overview.response_time.avg_secs)}
                </div>
                <p className="text-xs text-muted-foreground">time to reply</p>
              </CardContent>
            </Card>
          </div>

          {/* ST4: <StatsControlsBar/>, funnel + side KPI cards, status split */}

          {/* ST5: trend chart + Events view */}

          {/* ST6: phases, follow-up sequences, disqualified callout (stubs) */}
        </>
      )}
    </div>
  );
}
