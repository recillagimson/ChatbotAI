/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils";

/**
 * SpeedSettr logo — the brand horizontal lockup (ships in /public/brand).
 * Uses the dark lockup (built-in dark background, white wordmark) on dark
 * surfaces, and the transparent light lockup on light surfaces, so the logo is
 * always legible. Pass `dark` on dark surfaces; `size="sm"` for compact spots.
 */
export function Logo({
  className,
  dark = false,
  size = "md",
}: {
  className?: string;
  dark?: boolean;
  size?: "sm" | "md";
  showWordmark?: boolean;
}) {
  const height = size === "sm" ? "h-6" : "h-8";
  // Dark surfaces use the dark lockup with its background stripped so it sits
  // seamlessly on the brand sidebar/nav (the shipped dark lockup bakes in a
  // #1C0838 plaque that clashes with the #2E0A52 sidebar). Light surfaces use
  // the transparent light lockup.
  const src = dark
    ? "/brand/lockup-horizontal-dark-transparent.svg"
    : "/brand/lockup-horizontal-light.svg";
  return (
    <img
      src={src}
      alt="SpeedSettr"
      className={cn(height, "w-auto", className)}
    />
  );
}
