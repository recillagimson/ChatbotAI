import * as React from "react";
import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * Buttons
 * ------------------------------------------------------------------ */

/**
 * The dashboard's button ladder, straight from the design: indigo for the one
 * primary action on a screen, navy for the secondary-but-committing action
 * ("Retrain bot", "Copy all 23"), outline for everything reversible, soft
 * indigo for in-row actions, rose only for destructive confirmations.
 *
 * Exported as a class factory as well as a component so the many places that
 * need a `<Link>` styled as a button don't have to reach for `asChild`.
 */
export const ssButton = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] font-semibold leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-indigo focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-ss-indigo text-white hover:bg-ss-indigo-600",
        navy: "bg-ss-navy text-white hover:bg-ss-navy-700",
        outline:
          "border border-ss-line bg-white text-ss-ink hover:bg-ss-page hover:border-ss-dash",
        soft: "bg-ss-indigo-50 text-ss-indigo-700 hover:bg-ss-indigo-100",
        ghost: "text-ss-body hover:bg-ss-page hover:text-ss-ink",
        danger: "bg-ss-rose text-white hover:bg-ss-rose-ink",
        "danger-outline":
          "border border-ss-rose-line bg-white text-ss-rose-ink hover:bg-ss-rose-tint",
        amber: "bg-ss-amber text-white hover:bg-ss-amber-ink",
      },
      size: {
        sm: "px-3 py-2 text-[12px]",
        md: "px-[13px] py-2.5 text-[12.5px]",
        lg: "px-4 py-3 text-[13px]",
        icon: "h-[38px] w-[38px] p-0",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", block: false },
  }
);

type SsButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof ssButton>;

export const SsButton = React.forwardRef<HTMLButtonElement, SsButtonProps>(
  ({ className, variant, size, block, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(ssButton({ variant, size, block }), className)}
      {...props}
    />
  )
);
SsButton.displayName = "SsButton";

/** A `<Link>` wearing the button styling - the most common shape in the design. */
export function SsLinkButton({
  href,
  className,
  variant,
  size,
  block,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Link>, "href"> &
  VariantProps<typeof ssButton> & {
    href: string;
    children: React.ReactNode;
  }) {
  return (
    <Link
      href={href}
      className={cn(ssButton({ variant, size, block }), className)}
      {...props}
    >
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ *
 * Filter pills
 * ------------------------------------------------------------------ */

export const ssPill = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-[13px] py-2 text-[12px] leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-indigo focus-visible:ring-offset-1",
  {
    variants: {
      state: {
        /** Selected filter - solid indigo. */
        active: "bg-ss-indigo font-bold text-white",
        /** Selected, but the "everything" scope - navy, per the Learn screen. */
        "active-navy": "bg-ss-navy font-bold text-white",
        /** Unselected. */
        idle: "border border-ss-line bg-white font-medium text-ss-body hover:border-ss-dash hover:text-ss-ink",
        /** The standing "Needs attention · 3" pill - always rose, never idle. */
        alert: "bg-ss-rose-bg font-bold text-ss-rose-ink hover:bg-ss-rose-wash",
      },
    },
    defaultVariants: { state: "idle" },
  }
);

export function SsPill({
  href,
  active,
  tone,
  count,
  children,
  className,
}: {
  href?: string;
  active?: boolean;
  tone?: "indigo" | "navy" | "alert";
  /** Rendered after a "·" the way the design writes counted filters. */
  count?: number | null;
  children: React.ReactNode;
  className?: string;
}) {
  const state =
    tone === "alert"
      ? "alert"
      : active
        ? tone === "navy"
          ? "active-navy"
          : "active"
        : "idle";
  const body = (
    <>
      {children}
      {count != null ? (
        <span className="opacity-80"> · {count.toLocaleString()}</span>
      ) : null}
    </>
  );
  const classes = cn(ssPill({ state }), className);
  return href ? (
    <Link href={href} aria-current={active ? "page" : undefined} className={classes}>
      {body}
    </Link>
  ) : (
    <span className={classes}>{body}</span>
  );
}

/* ------------------------------------------------------------------ *
 * Chips & badges
 * ------------------------------------------------------------------ */

const CHIP_TONE = {
  indigo: "bg-ss-indigo-50 text-ss-indigo-700",
  rose: "bg-ss-rose text-white",
  "rose-soft": "bg-ss-rose-bg text-ss-rose-ink",
  amber: "bg-ss-amber-bg text-ss-amber-ink",
  green: "bg-ss-green-bg text-ss-green-ink",
  neutral: "bg-ss-chip text-ss-slate",
  ig: "bg-ss-ig-bg text-ss-ig-ink",
  fb: "bg-ss-fb-bg text-ss-fb-ink",
} as const;

export type ChipTone = keyof typeof CHIP_TONE;

/**
 * The small square-cornered label the design puts beside a name - a tag, a
 * channel, a file state. 5px radius, 10px bold text; deliberately squarer than
 * the round filter pills so the two never read as the same control.
 */
export function SsChip({
  tone = "indigo",
  className,
  children,
}: {
  tone?: ChipTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-[5px] px-[7px] py-0.5 text-[10px] font-bold uppercase leading-[1.5] tracking-wide",
        CHIP_TONE[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/**
 * Live-status pill with a leading dot - "ACTIVE", "CONNECTED", "PAID". The dot
 * is what makes it read as state rather than category.
 */
export function SsStatus({
  tone = "green",
  children,
  className,
}: {
  tone?: "green" | "amber" | "rose" | "neutral" | "indigo";
  children: React.ReactNode;
  className?: string;
}) {
  const tones = {
    green: "bg-ss-green-bg text-ss-green-ink",
    amber: "bg-ss-amber-bg text-ss-amber-ink",
    rose: "bg-ss-rose-bg text-ss-rose-ink",
    neutral: "bg-ss-chip text-ss-slate",
    indigo: "bg-ss-indigo-50 text-ss-indigo-700",
  };
  const dots = {
    green: "bg-ss-green",
    amber: "bg-ss-amber",
    rose: "bg-ss-rose",
    neutral: "bg-ss-faint",
    indigo: "bg-ss-indigo",
  };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[10px] font-bold uppercase leading-[1.6] tracking-wide",
        tones[tone],
        className
      )}
    >
      <span
        className={cn("h-[5px] w-[5px] shrink-0 rounded-full", dots[tone])}
        aria-hidden="true"
      />
      {children}
    </span>
  );
}

/**
 * A standalone health dot (no label) - used in the chatbot switcher and the
 * sidebar bot list where the row's text already says what the state is.
 */
export function SsDot({
  tone = "green",
  ring = false,
  className,
}: {
  tone?: "green" | "amber" | "rose" | "idle";
  /** Adds the soft halo the design puts behind the "AI replies are live" dot. */
  ring?: boolean;
  className?: string;
}) {
  const tones = {
    green: "bg-ss-green",
    amber: "bg-ss-amber",
    rose: "bg-ss-rose",
    idle: "bg-ss-dash",
  };
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block h-[7px] w-[7px] shrink-0 rounded-full",
        tones[tone],
        ring && tone === "green" && "shadow-[0_0_0_3px_rgba(5,150,105,.16)]",
        className
      )}
    />
  );
}

/**
 * Count badge - the red unread pip in the sidebar and the indigo message count
 * on an inbox row.
 */
export function SsCount({
  tone = "indigo",
  children,
  className,
}: {
  tone?: "indigo" | "rose" | "amber";
  children: React.ReactNode;
  className?: string;
}) {
  const tones = {
    indigo: "bg-ss-indigo",
    rose: "bg-ss-rose",
    amber: "bg-ss-amber",
  };
  return (
    <span
      className={cn(
        "inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-[5px] font-display text-[10px] font-bold leading-none text-white",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/**
 * Initial avatar. The design uses three fills: indigo (default), rose (a thread
 * that needs a human), and a flat lilac for contacts with no readable name.
 */
export function SsAvatar({
  name,
  size = 38,
  tone = "indigo",
  className,
}: {
  name: string | null | undefined;
  size?: number;
  tone?: "indigo" | "rose" | "flat" | "amber" | "chip";
  className?: string;
}) {
  const tones = {
    indigo: "bg-ss-indigo-50 text-ss-indigo-600",
    rose: "bg-ss-rose-bg text-ss-rose-ink",
    flat: "bg-ss-rule-indigo text-ss-indigo-600",
    amber: "bg-ss-amber-bg text-ss-amber-ink",
    chip: "bg-ss-chip text-ss-body",
  };
  const raw = (name ?? "").trim();
  // Usernames like "_jtan" have no letter to lead with; the design shows an
  // em-dash rather than an underscore or a blank circle.
  const letter = raw.replace(/[^\p{L}\p{N}]/gu, "").charAt(0);
  return (
    <span
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold uppercase leading-none",
        tones[tone],
        className
      )}
      aria-hidden="true"
    >
      {letter || "-"}
    </span>
  );
}

/**
 * Square initials tile for a chatbot ("FS", "LH", "LP") - the switcher, the
 * chatbot cards and the Statistics header all key off it, so the initials are
 * derived once here.
 */
export function SsBotMark({
  name,
  size = 34,
  tone = "indigo",
  className,
}: {
  name: string;
  size?: number;
  tone?: "indigo" | "solid" | "chip" | "amber";
  className?: string;
}) {
  const tones = {
    indigo: "bg-ss-indigo-50 text-ss-indigo-600",
    solid: "bg-ss-indigo-600 text-white",
    chip: "bg-ss-chip text-ss-body",
    amber: "bg-ss-amber-bg text-ss-amber-ink",
  };
  return (
    <span
      style={{ width: size, height: size, fontSize: Math.round(size * 0.35) }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[10px] font-display font-bold uppercase leading-none",
        tones[tone],
        className
      )}
      aria-hidden="true"
    >
      {botInitials(name)}
    </span>
  );
}

/** "Franco Salvacion Bot" → "FS"; "LGF HQ" → "LH"; "Stalliony" → "ST". */
export function botInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "??";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/* ------------------------------------------------------------------ *
 * Layout helpers
 * ------------------------------------------------------------------ */

/** The uppercase micro-label that heads a group in the sidebar and the cards. */
export function SsLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("ss-eyebrow text-ss-muted", className)}>{children}</div>
  );
}

/** 1px rule matching the design's `#f0f1f8` hairline. */
export function SsRule({ className }: { className?: string }) {
  return <div className={cn("h-px bg-ss-hair", className)} aria-hidden="true" />;
}
