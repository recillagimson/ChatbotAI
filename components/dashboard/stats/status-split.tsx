import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatusSplitProps {
  active: number;
  aiPaused: number;
  closed: number;
}

interface SegmentDef {
  key: "active" | "aiPaused" | "closed";
  label: string;
  count: number;
  barClass: string;
  dotClass: string;
}

export function StatusSplit({ active, aiPaused, closed }: StatusSplitProps) {
  const total = active + aiPaused + closed;

  const segments: SegmentDef[] = [
    {
      key: "active",
      label: "Active",
      count: active,
      barClass: "bg-primary",
      dotClass: "bg-primary",
    },
    {
      key: "aiPaused",
      label: "AI paused",
      count: aiPaused,
      barClass: "bg-conv-mid",
      dotClass: "bg-conv-mid",
    },
    {
      key: "closed",
      label: "Closed",
      count: closed,
      barClass: "bg-muted-foreground/40",
      dotClass: "bg-muted-foreground/40",
    },
  ];

  const ariaLabel =
    total === 0
      ? "Conversation status: no conversations in this range."
      : `Conversation status: ${active} active, ${aiPaused} AI paused, ${closed} closed.`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Conversation status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">
            No conversations in this range yet.
          </p>
        ) : (
          <>
            {/* Segmented bar */}
            <div
              role="img"
              aria-label={ariaLabel}
              className="flex h-3 w-full overflow-hidden rounded-full gap-0.5"
            >
              {segments
                .filter((s) => s.count > 0)
                .map((s) => (
                  <div
                    key={s.key}
                    className={cn("h-full transition-all motion-reduce:transition-none", s.barClass)}
                    style={{ flex: s.count / total }}
                  />
                ))}
            </div>

            {/* Legend */}
            <ul className="flex flex-wrap gap-x-6 gap-y-2" aria-hidden="true">
              {segments.map((s) => (
                <li key={s.key} className="flex items-center gap-2 text-sm">
                  <span
                    className={cn("h-2.5 w-2.5 rounded-full shrink-0", s.dotClass)}
                  />
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className="tabular-nums font-medium">{s.count}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
