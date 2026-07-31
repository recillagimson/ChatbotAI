import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StageConversation } from "@/lib/analytics";
import { StageConversationList } from "./stage-conversation-list";

interface FunnelStageRowProps {
  /** Stage key - also used as `?stage=` param value */
  stageKey: "entry" | "replied" | "link_sent" | "booked";
  label: string;
  count: number | null;
  /** entry count, used to compute bar width */
  entryCount: number;
  /** true = this stage is real and queryable */
  real: boolean;
  /** true = this stage is currently expanded */
  expanded: boolean;
  /** href to toggle expansion (null for stub) */
  toggleHref: string | null;
  /** Gradient step index (0 = darkest/entry, higher = lighter) */
  gradientIndex: number;

  /* expanded list props */
  rows: StageConversation[] | null;
  stageTotal: number;
  stageShown: number;
  loadMoreHref: string | null;
}

/**
 * Bar colour sequence: entry → darkest brand, later stages progressively lighter.
 * Uses inline styles for the gradient steps since they're dynamic.
 */
const BAR_GRADIENTS = [
  // entry - darkest brand
  "from-[#1e1b4b] to-[#4338ca]",
  // replied
  "from-[#4338ca] to-[#6366f1]",
  // link_sent
  "from-[#6366f1] to-[#818cf8]",
  // booked stub
  "from-muted to-muted",
] as const;

const MIN_BAR_PCT = 8; // % - ensures zero/tiny counts are still legible

export function FunnelStageRow({
  stageKey,
  label,
  count,
  entryCount,
  real,
  expanded,
  toggleHref,
  gradientIndex,
  rows,
  stageTotal,
  stageShown,
  loadMoreHref,
}: FunnelStageRowProps) {
  const isStub = !real || count === null;
  const barIndex = Math.min(gradientIndex, BAR_GRADIENTS.length - 1);

  // Width calculation: min 8%, max 100%, based on count vs entry
  const rawPct =
    !isStub && entryCount > 0 ? ((count as number) / entryCount) * 100 : 0;
  const widthPct = isStub ? MIN_BAR_PCT : Math.max(MIN_BAR_PCT, Math.min(100, rawPct));

  const countDisplay = isStub
    ? null
    : (count as number).toLocaleString();

  return (
    <div>
      {/* ── Bar row ── */}
      <div className="relative">
        {real && !isStub && toggleHref ? (
          <Link
            href={toggleHref}
            aria-expanded={expanded}
            aria-label={`${expanded ? "Collapse" : "Show"} conversations for ${label}`}
            className={cn(
              "group block w-full rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "transition-opacity hover:opacity-90",
            )}
          >
            <BarInner
              label={label}
              countDisplay={countDisplay}
              widthPct={widthPct}
              gradientClass={BAR_GRADIENTS[barIndex]}
              isStub={false}
              expanded={expanded}
            />
          </Link>
        ) : (
          // Stub: not a link
          <div aria-disabled="true" role="img" aria-label={`${label} - not tracked yet`}>
            <BarInner
              label={label}
              countDisplay={null}
              widthPct={widthPct}
              gradientClass={BAR_GRADIENTS[barIndex]}
              isStub={true}
              expanded={false}
            />
          </div>
        )}
      </div>

      {/* ── Expanded conversation list ── */}
      {expanded && real && rows !== null && (
        <StageConversationList
          rows={rows}
          total={stageTotal}
          shown={stageShown}
          loadMoreHref={loadMoreHref}
        />
      )}
    </div>
  );
}

/* ── Inner bar layout (shared between Link and div) ── */
interface BarInnerProps {
  label: string;
  countDisplay: string | null;
  widthPct: number;
  gradientClass: string;
  isStub: boolean;
  expanded: boolean;
}

function BarInner({
  label,
  countDisplay,
  widthPct,
  gradientClass,
  isStub,
  expanded,
}: BarInnerProps) {
  return (
    <div className="relative h-11 rounded-md overflow-hidden bg-muted/20">
      {/* Filled bar */}
      <div
        className={cn(
          "absolute inset-y-0 left-0 rounded-md bg-gradient-to-r transition-all duration-500",
          isStub ? "opacity-20" : "opacity-100",
          gradientClass,
        )}
        style={{ width: `${widthPct}%` }}
        aria-hidden="true"
      />

      {/* Content row inside the bar (always full width for readability) */}
      <div className="relative flex h-full items-center justify-between px-3 gap-2">
        <span
          className={cn(
            "text-sm font-medium leading-none truncate",
            isStub ? "text-muted-foreground" : "text-white drop-shadow-sm",
          )}
        >
          {label}
        </span>

        <div className="flex items-center gap-2 shrink-0">
          {isStub ? (
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0 h-4 rounded-sm bg-muted text-muted-foreground"
            >
              not tracked yet
            </Badge>
          ) : (
            <span className="text-sm font-display font-semibold tabular-nums text-white drop-shadow-sm">
              {countDisplay}
            </span>
          )}

          {/* Chevron toggle indicator */}
          {!isStub && (
            <span className="text-white/80" aria-hidden="true">
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
