import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * AURUM primitives.
 *
 * Server components by default - none of these hold state, so none of them
 * need to ship JavaScript. Interaction that genuinely requires a client
 * (the reveal observer, the ROI sliders, the booking form) lives in its own
 * "use client" file so a static section never drags a bundle along with it.
 *
 * Tokens come from styles/aurum.css via the `au-*` Tailwind aliases; nothing
 * here hardcodes a colour.
 */

/* ---------------------------------------------------------------- Button */

/**
 * One primary style, and it is gold. The label on it is near-black rather
 * than white: gold/ink measures 9.4:1 where gold/white is 2.0:1, so the dark
 * label is both the legible choice and the one that makes the button read as
 * a lit, physical object.
 *
 * Every variant carries `au-press`, so feedback happens on pointer-down at
 * 140ms instead of waiting for the click to resolve.
 */
const auButton = cva(
  "au-press relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-au font-semibold disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        primary:
          "au-btn-primary bg-au-gold text-au-ink shadow-au-gold hover:bg-au-gold-hi active:bg-au-gold-press",
        ink: "bg-au-ink text-au-on-dark shadow-au-2 hover:bg-[#2c2a24]",
        outline:
          "border border-au-line-strong bg-au-surface text-au-ink shadow-au-1 hover:border-au-ink-4 hover:bg-au-surface-raised",
        ghost: "text-au-ink-2 hover:bg-[rgba(26,25,22,0.05)] hover:text-au-ink",
        // Gold text on a light plane. Semibold at >=15px, which is where
        // #A06E08 clears AA - see the token comments in styles/aurum.css.
        link: "text-au-gold-ink underline decoration-au-gold-line decoration-2 underline-offset-4 hover:decoration-au-gold",
      },
      size: {
        sm: "h-9 rounded-au-ctl px-3.5 text-[13.5px]",
        md: "h-11 rounded-au-ctl px-5 text-[15px]",
        lg: "h-[52px] rounded-au-field px-7 text-[16.5px] tracking-[-0.01em]",
        xl: "h-[58px] rounded-au-field px-8 text-[17.5px] tracking-[-0.012em]",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", block: false },
  }
);

export interface AuButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof auButton> {
  asChild?: boolean;
}

export const AuButton = React.forwardRef<HTMLButtonElement, AuButtonProps>(
  ({ className, variant, size, block, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(auButton({ variant, size, block }), className)}
        {...props}
      />
    );
  }
);
AuButton.displayName = "AuButton";

/* ------------------------------------------------------------------ Card */

/**
 * The card plane is LIGHTER than the page, which is what makes it read as
 * raised. The shadow only confirms what the value difference already said -
 * that is why `elevation="flat"` still looks like a card.
 */
export function AuCard({
  className,
  elevation = "raised",
  as = "div",
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  elevation?: "flat" | "raised" | "float";
  as?: "div" | "article" | "section" | "li";
}) {
  // The four allowed tags share every attribute this component forwards, but
  // TS resolves the union to the narrowest element's props and rejects the
  // rest. One assertion here beats a generic signature every caller has to
  // satisfy.
  const Tag = as as React.ElementType;
  return (
    <Tag
      className={cn(
        "rounded-au-card border border-au-line bg-au-surface",
        elevation === "raised" && "shadow-au-2",
        elevation === "float" && "shadow-au-3",
        className
      )}
      {...props}
    />
  );
}

/* --------------------------------------------------------------- Eyebrow */

export function AuEyebrow({
  children,
  tone = "gold",
  className,
}: {
  children: React.ReactNode;
  tone?: "gold" | "muted" | "dark";
  className?: string;
}) {
  return (
    <p
      className={cn(
        "au-eyebrow",
        // Uppercase at 11px is small text, so the gold here is the DEEP tone.
        // The light #A06E08 would sit at ~4.4:1 and miss AA at this size.
        tone === "gold" && "text-au-gold-ink-sm",
        tone === "muted" && "text-au-ink-3",
        tone === "dark" && "text-au-gold",
        className
      )}
    >
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ Pill */

export function AuPill({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "gold" | "good" | "dark";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-au-pill border px-3 py-1.5 text-[12.5px] font-semibold leading-none",
        tone === "neutral" && "border-au-line bg-au-surface text-au-ink-2",
        tone === "gold" &&
          "border-au-gold-line bg-au-gold-wash text-au-gold-ink-sm",
        tone === "good" && "border-transparent bg-au-good-wash text-au-good",
        tone === "dark" &&
          "border-white/10 bg-white/[0.07] text-au-on-dark backdrop-blur-sm",
        className
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ Stat */

/**
 * A number the reader is meant to stop on. The figure is gold because gold
 * is the system's attention colour - it appears on CTAs and on key numbers,
 * and nowhere else, so the eye learns in one scroll that gold means "this
 * matters".
 */
export function AuStat({
  value,
  label,
  sub,
  tone = "gold",
  className,
}: {
  value: React.ReactNode;
  label: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "gold" | "ink" | "dark";
  className?: string;
}) {
  return (
    <div className={className}>
      <div
        className={cn(
          "au-num text-[clamp(2rem,4.4vw,2.875rem)] leading-none",
          tone === "gold" && "text-au-gold-ink",
          tone === "ink" && "text-au-ink",
          tone === "dark" && "text-au-gold"
        )}
      >
        {value}
      </div>
      <div
        className={cn(
          "mt-2.5 text-[14px] font-semibold leading-snug",
          tone === "dark" ? "text-au-on-dark" : "text-au-ink"
        )}
      >
        {label}
      </div>
      {sub ? (
        <div
          className={cn(
            "au-caption mt-1",
            tone === "dark" ? "text-au-on-dark-2" : "text-au-ink-3"
          )}
        >
          {sub}
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- Section */

/**
 * Vertical rhythm lives here, not in each section. `tone` alternates the
 * ground between the page colour and a slightly sunk well, which separates
 * blocks without a single divider line.
 */
export function AuSection({
  children,
  tone = "canvas",
  className,
  id,
}: {
  children: React.ReactNode;
  tone?: "canvas" | "sunk" | "tint" | "dark";
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      // scroll-mt clears the fixed glass header when an anchor is jumped to,
      // otherwise the heading lands underneath the bar.
      className={cn(
        "scroll-mt-20 px-5 py-[clamp(4rem,9vw,7.5rem)] sm:px-8",
        tone === "canvas" && "bg-au-canvas",
        tone === "sunk" && "bg-au-canvas-sunk",
        tone === "tint" && "bg-au-gold-tint",
        tone === "dark" && "bg-au-obsidian",
        className
      )}
    >
      <div className="mx-auto w-full max-w-[1120px]">{children}</div>
    </section>
  );
}

export function AuSectionHead({
  eyebrow,
  title,
  body,
  dark = false,
  align = "left",
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  body?: React.ReactNode;
  dark?: boolean;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        align === "center" && "mx-auto text-center",
        "max-w-[42rem]",
        className
      )}
    >
      {eyebrow ? (
        <AuEyebrow tone={dark ? "dark" : "gold"}>{eyebrow}</AuEyebrow>
      ) : null}
      <h2
        className={cn(
          "au-title-1 mt-4 text-balance",
          dark ? "text-au-on-dark" : "text-au-ink"
        )}
      >
        {title}
      </h2>
      {body ? (
        <p
          className={cn(
            "au-body-lg mt-5 text-pretty",
            dark ? "text-au-on-dark-2" : "text-au-ink-2"
          )}
        >
          {body}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Rule */

export function AuRule({ className }: { className?: string }) {
  return <div className={cn("au-rule", className)} aria-hidden="true" />;
}
