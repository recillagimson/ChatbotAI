import { cn } from "@/lib/utils";

/**
 * The HighThrive.ai mark: a rising line through a small node cluster, ending in
 * the arrowhead. Same geometry as the landing header and the auth screens.
 * Draws in `currentColor`, so the caller sets its colour.
 */
export function HighThriveMark({
  size = 26,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      className={cn("block shrink-0", className)}
    >
      <g
        stroke="currentColor"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          d="M14 48 L30 26 M30 26 L48 20 M14 48 L22 68 M22 68 L48 20"
          strokeWidth="2"
          opacity="0.6"
        />
        <polyline points="16,76 40,52 54,66 79,31" strokeWidth="9" />
      </g>
      <g fill="currentColor">
        <circle cx="14" cy="48" r="5" />
        <circle cx="30" cy="26" r="4" />
        <circle cx="48" cy="20" r="5.5" />
        <circle cx="22" cy="68" r="3.5" />
        <polygon points="88,18 88,46 60,22" />
      </g>
    </svg>
  );
}

/**
 * Mark + "HighThrive.ai" + a micro-caps tagline, as the app rails set it. The
 * tagline defaults to the product line; the admin rail passes "Admin console".
 */
export function HighThriveLockup({
  tagline = "AI Setter & Closer",
  className,
}: {
  tagline?: string;
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-ctl-lg border border-ss-indigo/25 bg-ss-indigo-50 text-ss-indigo">
        <HighThriveMark size={22} />
      </span>
      <span className="min-w-0">
        <span className="block font-display text-[16px] font-semibold leading-none tracking-[-0.025em] text-ss-ink">
          HighThrive.ai
        </span>
        <span className="mt-[5px] block text-[8.5px] font-medium uppercase leading-none tracking-[0.18em] text-ss-nav-dim">
          {tagline}
        </span>
      </span>
    </span>
  );
}
