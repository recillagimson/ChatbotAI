/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils";

/**
 * The brand lockup for the dark marketing page: the original violet icon beside
 * a white wordmark.
 *
 * The flat white-knockout lockup (`<Logo white />`) loses the violet entirely,
 * which on a page this dark is the only saturated brand colour in the header.
 * So the icon keeps its real artwork and only the wordmark is set in white -
 * the same split the design uses.
 */
export function BrandLockup({
  className,
  size = "md",
  tagline = true,
}: {
  className?: string;
  size?: "sm" | "md";
  tagline?: boolean;
}) {
  const icon = size === "sm" ? "h-8 w-8" : "h-9 w-9";
  const word = size === "sm" ? "text-[15px]" : "text-[17px]";

  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <img
        src="/brand/logo-icon.webp"
        alt=""
        width={132}
        height={128}
        draggable={false}
        aria-hidden
        className={cn(
          icon,
          "select-none object-contain drop-shadow-[0_2px_10px_rgba(124,34,196,0.6)]"
        )}
      />
      <span className="min-w-0">
        <span
          className={cn(
            "block font-display font-extrabold italic leading-none tracking-[-0.01em] text-white",
            word
          )}
        >
          SPEEDSETTR
        </span>
        {tagline && (
          <span className="mt-1 block text-[6px] font-semibold leading-none tracking-[0.2em] text-[#9b8fd0]">
            RAPID LEAD CONVERSION AI
          </span>
        )}
      </span>
    </span>
  );
}
