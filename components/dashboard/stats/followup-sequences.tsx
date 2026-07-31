import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * FollowupSequences - REAL aggregate at top + HONEST STUB per-step section
 *
 * Shows two real numbers (followupsSent, convWithFollowup) sourced from
 * overview.followups. If followupsSent === 0 a muted note explains that
 * automated follow-ups are currently off (FOLLOWUP_ENABLED=false).
 *
 * Below the real aggregate, recreates setty.ai's Pre-Link / Post-Link
 * two-column layout as clearly muted stub cards. "-" everywhere a count
 * would appear; "per-step tracking coming soon" badge signals placeholder.
 */

interface StepCardProps {
  stepLabel: string;
  sentLabel: string;
  replyLabel: string;
}

function StepCard({ stepLabel, sentLabel, replyLabel }: StepCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-muted-foreground/25",
        "bg-muted/10 p-4 opacity-55"
      )}
      aria-label={`${stepLabel} - placeholder step, not tracked`}
    >
      <p className="text-xs font-medium text-muted-foreground/70 mb-3">
        {stepLabel}
      </p>
      <div className="flex flex-col gap-2">
        {/* Sent row */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground/60">{sentLabel}</span>
          <span
            className="text-base font-display font-semibold tabular-nums text-muted-foreground/30"
            aria-hidden="true"
          >
            -
          </span>
        </div>
        {/* Reply row */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground/60">{replyLabel}</span>
          <span
            className="text-base font-display font-semibold tabular-nums text-muted-foreground/30"
            aria-hidden="true"
          >
            -
          </span>
        </div>
      </div>
    </div>
  );
}

export function FollowupSequences({
  followupsSent,
  convWithFollowup,
}: {
  followupsSent: number;
  convWithFollowup: number;
}) {
  const followupsOff = followupsSent === 0;

  return (
    <div className="mb-8">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            Follow-up sequences
          </CardTitle>
        </CardHeader>

        <CardContent>
          {/* ── REAL aggregate section ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                Follow-ups sent
              </span>
              <span
                className="text-2xl font-display font-semibold tabular-nums"
                aria-label={`Follow-ups sent: ${followupsSent}`}
              >
                {followupsSent}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                Conversations re-engaged
              </span>
              <span
                className="text-2xl font-display font-semibold tabular-nums"
                aria-label={`Conversations re-engaged: ${convWithFollowup}`}
              >
                {convWithFollowup}
              </span>
            </div>
          </div>

          {/* Off note - shown when automated follow-ups are parked */}
          {followupsOff && (
            <p className="text-xs text-muted-foreground/70 mb-6 italic">
              Automated follow-ups are currently turned off.
            </p>
          )}

          {/* ── STUB: Pre-Link / Post-Link columns ── */}
          <div className="border-t border-border/40 pt-5">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-sm font-medium text-muted-foreground">
                Step breakdown
              </span>
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 h-4 rounded-sm opacity-70"
              >
                per-step tracking coming soon
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Pre-Link column */}
              <div className="flex flex-col gap-3">
                <p
                  className="text-xs font-semibold text-muted-foreground/50 uppercase tracking-wide"
                  aria-label="Pre-link follow-up steps - placeholder"
                >
                  Pre-Link
                </p>
                <StepCard
                  stepLabel="Step 1 - Initial follow-up"
                  sentLabel="Sent"
                  replyLabel="Replied"
                />
                <StepCard
                  stepLabel="Step 2 - Re-engagement"
                  sentLabel="Sent"
                  replyLabel="Replied"
                />
              </div>

              {/* Post-Link column */}
              <div className="flex flex-col gap-3">
                <p
                  className="text-xs font-semibold text-muted-foreground/50 uppercase tracking-wide"
                  aria-label="Post-link follow-up steps - placeholder"
                >
                  Post-Link
                </p>
                <StepCard
                  stepLabel="Step 1 - Link reminder"
                  sentLabel="Sent"
                  replyLabel="Replied"
                />
                <StepCard
                  stepLabel="Step 2 - Booking nudge"
                  sentLabel="Sent"
                  replyLabel="Replied"
                />
              </div>
            </div>

            {/* Bottom note */}
            <p className="text-xs text-muted-foreground/60 mt-4">
              Per-step and pre/post-link breakdowns aren&apos;t tracked yet.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
