import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TrendingDown } from "lucide-react";
import { safePct, type FunnelStage, type StageConversation } from "@/lib/analytics";
import { ConversionPill } from "./conversion-pill";
import { FunnelStageRow } from "./funnel-stage-row";

interface FunnelStageConfig {
  key: string;
  label: string;
  count: number | null;
  real: boolean;
}

interface FunnelProps {
  stages: FunnelStageConfig[];
  expandedStage: FunnelStage | null;
  stageRows: StageConversation[] | null;
  stageTotal: number;
  stageShown: number;
  makeHref: (updates: Record<string, string | null>) => string;
}

/**
 * Conversation Funnel card.
 * Renders stage bars with interleaved conversion pills and optional expanded
 * conversation lists. All expansion is URL-driven via <Link> — no client JS.
 */
export function Funnel({
  stages,
  expandedStage,
  stageRows,
  stageTotal,
  stageShown,
  makeHref,
}: FunnelProps) {
  const entryStage = stages[0];
  const entryCount = entryStage?.count ?? 0;

  return (
    <Card className="h-full">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
          <CardTitle className="text-base font-display">Conversation Funnel</CardTitle>
        </div>
        <CardDescription className="tabular-nums">
          {entryCount.toLocaleString()} conversation{entryCount !== 1 ? "s" : ""} in this period
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="space-y-2">
          {stages.map((stage, idx) => {
            const isExpanded = expandedStage === stage.key;
            const isReal = stage.real;

            // Toggle href: open this stage (or close it if already open)
            const toggleHref = isReal
              ? isExpanded
                ? makeHref({ stage: null, stage_n: null })
                : makeHref({ stage: stage.key, stage_n: null })
              : null;

            // Load-more href: increment stage_n by 8
            const nextN = stageShown + 8;
            const loadMoreHref =
              isExpanded && stageShown < stageTotal
                ? makeHref({ stage: stage.key, stage_n: String(nextN) })
                : null;

            return (
              <div key={stage.key}>
                {/* Conversion pill between consecutive stages */}
                {idx > 0 && (
                  <ConversionPill
                    pct={
                      // Show null ("—") when prev is 0 or this stage is stub
                      stage.real && stage.count !== null
                        ? safePct(
                            stage.count,
                            stages[idx - 1].count ?? 0,
                          )
                        : null
                    }
                  />
                )}

                <FunnelStageRow
                  stageKey={stage.key as "entry" | "replied" | "link_sent" | "booked"}
                  label={stage.label}
                  count={stage.count}
                  entryCount={entryCount}
                  real={isReal}
                  expanded={isExpanded}
                  toggleHref={toggleHref}
                  gradientIndex={idx}
                  rows={isExpanded ? stageRows : null}
                  stageTotal={stageTotal}
                  stageShown={stageShown}
                  loadMoreHref={loadMoreHref}
                />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
