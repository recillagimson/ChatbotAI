import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * SpeedSettr dashboard card - the single surface every panel in the design sits
 * on: white, one #e7e8f3 hairline, 16px corners, no drop shadow beyond a 1px
 * lift. `tone` swaps the whole surface for the three semantic variants the
 * blueprint uses (amber "needs your attention", rose "something failed", indigo
 * "we suggest"), each of which restates fill + border together so a tinted card
 * is never a white card with a coloured edge.
 *
 * Deliberately separate from [components/ui/card.tsx] (shadcn), which still
 * serves the auth, admin and marketing surfaces on their own token set.
 */
export type SsTone = "plain" | "amber" | "rose" | "indigo" | "navy" | "soft";

const TONE: Record<SsTone, string> = {
  plain: "bg-white border-ss-line",
  amber: "bg-ss-amber-tint border-ss-amber-line",
  rose: "bg-ss-rose-tint border-ss-rose-line",
  indigo: "bg-ss-indigo-25 border-ss-rule-indigo",
  navy: "bg-ss-navy border-transparent",
  soft: "bg-ss-page-alt border-ss-line",
};

export function SsCard({
  tone = "plain",
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tone?: SsTone }) {
  return (
    <div
      className={cn("rounded-card border", TONE[tone], className)}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Card head - title (Outfit 700/15px), optional one-line description, and an
 * optional trailing action pushed to the right. Used by roughly every panel in
 * the design, so it is worth the component rather than the repeated flex row.
 */
export function SsCardHead({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      {icon}
      <div className="min-w-0">
        <div className="font-display text-[15px] font-bold leading-tight text-ss-ink">
          {title}
        </div>
        {description ? (
          <div className="mt-0.5 text-xs leading-snug text-ss-muted">
            {description}
          </div>
        ) : null}
      </div>
      {action ? <div className="ml-auto shrink-0">{action}</div> : null}
    </div>
  );
}

/**
 * The small indigo text link that closes most cards in the design
 * ("Open the full inbox →", "Statistics", "Show the other 20 →").
 */
export function SsCardLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "text-xs font-semibold text-ss-indigo-600 transition-colors hover:text-ss-indigo-800",
        className
      )}
    >
      {children}
    </Link>
  );
}

/**
 * A rounded icon tile - the 30–40px squircle that fronts a card head or a row
 * in the design (rose for alarms, indigo for neutral/AI, amber for warnings).
 */
export function SsIconTile({
  tone = "indigo",
  size = 30,
  children,
  className,
}: {
  tone?: "indigo" | "rose" | "amber" | "green" | "chip" | "navy";
  size?: number;
  children: React.ReactNode;
  className?: string;
}) {
  const tones: Record<string, string> = {
    indigo: "bg-ss-indigo-50 text-ss-indigo-600",
    rose: "bg-ss-rose-bg text-ss-rose",
    amber: "bg-ss-amber-bg text-ss-amber",
    green: "bg-ss-green-bg text-ss-green",
    chip: "bg-ss-chip text-ss-body",
    navy: "bg-ss-navy text-white",
  };
  return (
    <span
      style={{ width: size, height: size }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-ctl-lg",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
