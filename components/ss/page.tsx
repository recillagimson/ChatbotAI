import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Page chrome shared by every dashboard screen in the design: a white header
 * strip pinned above a scrolling body on the #f6f7fc ground.
 *
 * The header is `flex-none` and the body owns the scroll, which is what lets the
 * two-pane inbox and the tabbed chatbot detail keep their headers fixed while
 * their content moves. Screens that only need a simple scroll get the same look
 * for free.
 */
export function PageShell({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex h-full min-w-0 flex-col bg-ss-page", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  leading,
  /** Tabs or a filter row that sits flush with the bottom edge of the header. */
  below,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  leading?: React.ReactNode;
  below?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex-none border-b border-ss-line bg-white px-5 pt-[18px] sm:px-[30px]",
        below ? "pb-0" : "pb-[18px]",
        className
      )}
    >
      <div className="flex flex-wrap items-start gap-x-3.5 gap-y-3">
        {leading}
        <div className="min-w-0">
          <h1 className="font-display text-[22px] font-bold leading-[1.1] tracking-[-0.01em] text-ss-ink">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 text-[12.5px] leading-snug text-ss-muted">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="ml-auto flex flex-wrap items-center gap-2.5">
            {actions}
          </div>
        ) : null}
      </div>
      {below}
    </header>
  );
}

/** The scrolling content column under a [PageHeader]. */
export function PageBody({
  className,
  children,
  center,
  maxWidth,
}: {
  className?: string;
  children: React.ReactNode;
  /** Billing and Settings centre their column; list screens run full width. */
  center?: boolean;
  maxWidth?: number;
}) {
  const inner = (
    <div
      style={maxWidth ? { maxWidth } : undefined}
      className={cn("flex w-full flex-col gap-5", className)}
    >
      {children}
    </div>
  );
  return (
    <div
      className={cn(
        "ss-scroll flex-1 overflow-auto px-5 pb-8 pt-6 sm:px-[30px]",
        // `items-start` is load-bearing, not cosmetic. Centring turns this into a
        // row flex container, and the default `stretch` would pin the column to
        // the viewport height - its cards would then shrink to fit instead of
        // overflowing, silently clipping their own content (an `overflow-hidden`
        // card loses whatever doesn't fit) while this box has nothing to scroll.
        center && "flex items-start justify-center"
      )}
    >
      {inner}
    </div>
  );
}

/**
 * The design's tab strip - an underline-on-active row used by the chatbot
 * detail and the Statistics views. Rendered as links so tabs are shareable URLs.
 */
export function TabStrip({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <nav
      className={cn("ss-rail -mb-px mt-4 flex gap-0.5", className)}
      aria-label="Sections"
    >
      {children}
    </nav>
  );
}

export function Tab({
  active,
  children,
  ...props
}: { active?: boolean } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex shrink-0 items-center gap-[7px] whitespace-nowrap px-[15px] py-3 text-[13px] leading-none transition-colors",
        active
          ? "font-bold text-ss-ink shadow-[inset_0_-2px_0_#6366f1]"
          : "font-medium text-ss-muted hover:text-ss-body"
      )}
      {...props}
    >
      {children}
    </a>
  );
}

/**
 * Honest empty state. The design is emphatic about this - its Statistics screen
 * replaces "six empty cards" with one line that says what is missing and when it
 * will come back, so this component insists on a reason, not just an icon.
 */
export function EmptyState({
  icon,
  title,
  children,
  action,
  variant = "card",
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  /** `inline` is the one-line dashed strip; `card` is the centred block. */
  variant?: "card" | "inline";
  className?: string;
}) {
  if (variant === "inline") {
    return (
      <div
        className={cn(
          "rounded-card border border-dashed border-ss-dash bg-[#f2f3fb] px-[18px] py-4",
          className
        )}
      >
        <div className="flex items-center gap-2 text-[12.5px] font-semibold leading-none text-ss-body">
          {icon}
          {title}
        </div>
        {children ? (
          <p className="mt-2 text-xs leading-relaxed text-ss-muted">{children}</p>
        ) : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "rounded-card border border-dashed border-ss-rule bg-ss-soft px-4 py-8 text-center",
        className
      )}
    >
      {icon ? (
        <div className="mb-3 flex justify-center text-ss-faint">{icon}</div>
      ) : null}
      <p className="text-[12.5px] font-semibold leading-snug text-ss-body">
        {title}
      </p>
      {children ? (
        <p className="mx-auto mt-1.5 max-w-md text-[11.5px] leading-relaxed text-ss-muted">
          {children}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/**
 * The full-width callout strip the design uses for a single urgent fact
 * ("181 replies never left ManyChat", "7 threads close within the hour").
 */
export function Callout({
  tone = "amber",
  icon,
  title,
  children,
  actions,
  className,
}: {
  tone?: "amber" | "rose" | "indigo" | "plain";
  icon?: React.ReactNode;
  title?: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  const tones = {
    amber: "border-ss-amber-line bg-ss-amber-tint",
    rose: "border-ss-rose-line bg-ss-rose-tint",
    indigo: "border-ss-rule-indigo bg-ss-indigo-25",
    plain: "border-ss-line bg-white",
  };
  const titles = {
    amber: "text-ss-ink",
    rose: "text-ss-rose-deep",
    indigo: "text-ss-ink",
    plain: "text-ss-ink",
  };
  const bodies = {
    amber: "text-ss-amber-ink",
    rose: "text-ss-rose-ink",
    indigo: "text-ss-body",
    plain: "text-ss-body",
  };
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-panel border px-[18px] py-[15px]",
        tones[tone],
        className
      )}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <div className="min-w-[12rem] flex-1">
        {title ? (
          <div
            className={cn(
              "text-[13.5px] font-bold leading-tight",
              titles[tone]
            )}
          >
            {title}
          </div>
        ) : null}
        {children ? (
          <div
            className={cn(
              "text-[12.5px] leading-snug",
              title && "mt-1",
              bodies[tone]
            )}
          >
            {children}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
