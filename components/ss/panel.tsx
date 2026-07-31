import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The navy panel - the design's one "dark" surface, used wherever a screen has
 * a single headline fact (speed-to-lead, the 24-hour window, a bot's health,
 * the yearly-billing pitch). It carries a pair of rotated light streaks: the
 * blueprint's nod to the logo's speed bolt, and the only ornament in the system.
 */
export function NavyPanel({
  gradient = false,
  streaks = true,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  /** The Overview hero uses a 103° navy→violet wash; other panels are flat. */
  gradient?: boolean;
  streaks?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-card-lg",
        gradient
          ? "bg-[linear-gradient(103deg,#1e1b4b_0%,#2b2566_62%,#332a78_100%)]"
          : "bg-ss-navy",
        className
      )}
      {...props}
    >
      {streaks ? (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-10 right-[120px] h-[220px] w-[2px] rotate-[24deg] bg-white/5"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-10 right-24 h-[220px] w-[6px] rotate-[24deg] bg-ss-indigo/25"
          />
        </>
      ) : null}
      {children}
    </div>
  );
}

/** Eyebrow inside a navy panel - lilac micro-caps with a leading icon. */
export function PanelEyebrow({
  icon,
  children,
  className,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-[7px] text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-ss-nav-meta",
        className
      )}
    >
      {icon ? <span className="text-ss-indigo-300">{icon}</span> : null}
      {children}
    </div>
  );
}

/** Vertical hairline that splits a navy panel into columns. */
export function PanelDivider({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("w-px shrink-0 bg-white/10", className)}
    />
  );
}
