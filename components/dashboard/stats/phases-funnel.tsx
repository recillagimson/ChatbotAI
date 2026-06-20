import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * PhasesFunnel — HONEST STUB (with one real anchor stat)
 *
 * Recreates setty.ai's branching "Conversation phases" section as a clearly
 * muted placeholder. No per-phase counts are tracked. The only real number
 * shown is avgMsgsPerConvo which anchors the card so it isn't pure vapor.
 *
 * Visual design: muted, dashed-border phase nodes in a branching layout,
 * with explicit opacity reduction and "—" placeholders everywhere a count
 * would appear. The "not instrumented yet" badge in the header signals stub
 * status immediately.
 */

interface PhaseNode {
  id: string;
  label: string;
}

// Representative phase topology mirroring setty.ai's branching layout:
// one root → two mid branches → three leaf nodes.
const PHASE_ROWS: PhaseNode[][] = [
  [{ id: "root", label: "Opening" }],
  [
    { id: "mid-a", label: "Qualifying" },
    { id: "mid-b", label: "Nurturing" },
  ],
  [
    { id: "leaf-a", label: "Pitch" },
    { id: "leaf-b", label: "Objection" },
    { id: "leaf-c", label: "Close" },
  ],
];

function PhaseNode({ label }: { label: string }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 px-4 py-3 rounded-lg",
        "border border-dashed border-muted-foreground/25",
        "bg-muted/10 opacity-60 min-w-[90px]"
      )}
      aria-label={`${label} — placeholder, not tracked`}
    >
      <span className="text-xs font-medium text-muted-foreground/70 text-center leading-tight">
        {label}
      </span>
      <span
        className="text-lg font-display font-semibold tabular-nums text-muted-foreground/30"
        aria-hidden="true"
      >
        —
      </span>
    </div>
  );
}

export function PhasesFunnel({
  avgMsgsPerConvo,
}: {
  avgMsgsPerConvo: number;
}) {
  return (
    <div className="mb-8">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base font-medium">
              Conversation phases
            </CardTitle>
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0 h-4 rounded-sm opacity-80"
            >
              not instrumented yet
            </Badge>
          </div>
        </CardHeader>

        <CardContent>
          {/* Branching phase diagram — muted placeholder nodes */}
          <div
            className="flex flex-col items-center gap-5 py-4 mb-6"
            aria-label="Placeholder conversation phase diagram — no data tracked yet"
            role="img"
          >
            {PHASE_ROWS.map((row, rowIdx) => (
              <div key={rowIdx} className="flex items-center justify-center gap-4 flex-wrap">
                {row.map((node) => (
                  <PhaseNode key={node.id} label={node.label} />
                ))}
              </div>
            ))}

            {/* Connector hint — subtle vertical dots between rows */}
            <p className="text-[10px] text-muted-foreground/40 text-center mt-1 italic">
              Phase nodes above are illustrative placeholders
            </p>
          </div>

          {/* Explanatory note */}
          <p className="text-sm text-muted-foreground mb-5">
            Per-conversation phase tracking isn&apos;t enabled yet. Once
            conversations are classified into phases, this funnel will show how
            they progress.
          </p>

          {/* Anchor stat — the ONE real number */}
          <div className="flex items-baseline gap-2 border-t border-border/40 pt-4">
            <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
              Avg messages / conversation
            </span>
            <span
              className="text-xl font-display font-semibold tabular-nums text-foreground"
              aria-label={`Average messages per conversation: ${avgMsgsPerConvo}`}
            >
              {avgMsgsPerConvo}
            </span>
            <span className="text-xs text-muted-foreground">(real)</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
