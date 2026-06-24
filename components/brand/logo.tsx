/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils";

/**
 * SpeedSettr logo — the original full-color brand artwork (icon + wordmark +
 * tagline), background-removed + optimized to WebP (see public/brand/).
 *
 * The color lockup's "SPEED" is deep navy, which would vanish on dark surfaces,
 * so on `dark` placements (sidebar, hero, auth panel, footer, admin nav) the
 * color logo sits on a white "chip" to stay crisp and legible. Light surfaces
 * show the color logo directly. `showWordmark={false}` renders the icon alone.
 */
export function Logo({
  className,
  dark = false,
  white = false,
  size = "md",
  showWordmark = true,
}: {
  className?: string;
  dark?: boolean;
  /** Render the flat white knockout (sits directly on dark surfaces, no chip). */
  white?: boolean;
  size?: "sm" | "md";
  showWordmark?: boolean;
}) {
  const height = size === "sm" ? "h-8" : "h-10";
  const colorSrc = showWordmark
    ? "/brand/logo-lockup.webp"
    : "/brand/logo-icon.webp";
  const whiteSrc = showWordmark
    ? "/brand/logo-lockup-white.webp"
    : "/brand/logo-icon-white.webp";
  const src = white ? whiteSrc : colorSrc;
  const dims = showWordmark
    ? { width: 413, height: 120 }
    : { width: 132, height: 128 };

  const img = (
    <img
      src={src}
      alt="SpeedSettr"
      width={dims.width}
      height={dims.height}
      draggable={false}
      className={cn(height, "w-auto select-none", (white || !dark) && className)}
    />
  );

  // White knockout: sits directly on dark surfaces, no chip needed.
  if (white) return img;

  // Light surfaces: full-color logo directly.
  if (!dark) return img;

  // Dark surfaces: full-color logo on a white chip so the navy wordmark reads.
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-xl bg-white shadow-[0_4px_16px_-6px_rgba(0,0,0,0.45)] ring-1 ring-black/5",
        size === "sm" ? "px-2.5 py-1" : "px-3 py-1.5",
        className
      )}
    >
      {img}
    </span>
  );
}
