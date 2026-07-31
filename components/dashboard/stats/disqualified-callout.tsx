import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserX } from "lucide-react";

/**
 * DisqualifiedCallout - HONEST STUB
 *
 * Mirrors setty.ai's "Disqualified Leads" callout but rendered as a clearly
 * muted placeholder. We do not track disqualified leads; no fake number is
 * shown. The "-" value and "not tracked yet" badge make the stub status
 * immediately apparent.
 */
export function DisqualifiedCallout() {
  return (
    <div className="mb-8" aria-label="Disqualified leads - not tracked yet">
      <Card className="border border-border/40 bg-muted/20">
        <CardContent className="py-5 px-6">
          <div className="flex items-center gap-4">
            {/* Left accent bar */}
            <div
              className="w-1 self-stretch rounded-full bg-muted-foreground/20 shrink-0"
              aria-hidden="true"
            />

            {/* Icon */}
            <UserX
              className="h-5 w-5 text-muted-foreground/50 shrink-0"
              aria-hidden="true"
            />

            {/* Text block */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-sm font-medium text-muted-foreground">
                  Disqualified leads
                </span>
                <Badge
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0 h-4 rounded-sm opacity-70"
                >
                  not tracked yet
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground/60">
                Mark conversations as disqualified to see them exit the funnel
                here - coming soon.
              </p>
            </div>

            {/* Value placeholder */}
            <div
              className="text-2xl font-display font-semibold tabular-nums text-muted-foreground/30 shrink-0"
              aria-label="No data - not tracked yet"
            >
              -
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
