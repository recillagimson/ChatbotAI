import { cn } from "@/lib/utils";
import { PLATFORM_META, toPlatform, type Platform } from "@/lib/platforms";

/**
 * Channel chip - "IG", "FB", "WA". The design keys channels by two-letter code
 * in the app's own colours rather than by brand logo, so a row of them stays
 * legible at 9.5px and doesn't turn the inbox into a logo wall.
 */
const CODE: Record<Platform, string> = {
  instagram: "IG",
  messenger: "FB",
  whatsapp: "WA",
  telegram: "TG",
  tiktok: "TT",
};

const TONE: Record<Platform, string> = {
  instagram: "bg-ss-ig-bg text-ss-ig-ink",
  messenger: "bg-ss-fb-bg text-ss-fb-ink",
  whatsapp: "bg-ss-green-bg text-ss-green-ink",
  telegram: "bg-[#e7f4ff] text-[#0369a1]",
  tiktok: "bg-ss-chip text-ss-slate",
};

export function channelCode(platform: unknown): string {
  return CODE[toPlatform(platform)];
}

export function ChannelChip({
  platform,
  count,
  className,
}: {
  platform: unknown;
  /** Appended inside the chip ("IG 13") the way the Overview bot card shows it. */
  count?: number | null;
  className?: string;
}) {
  const p = toPlatform(platform);
  return (
    <span
      title={PLATFORM_META[p].label}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-[9.5px] font-bold leading-[1.4]",
        TONE[p],
        className
      )}
    >
      {CODE[p]}
      {count != null ? <span className="tabular-nums">{count}</span> : null}
      <span className="sr-only">{PLATFORM_META[p].label}</span>
    </span>
  );
}

/** The larger square channel tile used on the chatbot detail's Channels list. */
export function ChannelTile({
  platform,
  size = 32,
  muted = false,
  className,
}: {
  platform: unknown;
  size?: number;
  muted?: boolean;
  className?: string;
}) {
  const p = toPlatform(platform);
  return (
    <span
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-ctl font-bold leading-none",
        muted ? "bg-ss-chip text-ss-muted" : TONE[p],
        className
      )}
      aria-hidden="true"
    >
      {CODE[p]}
    </span>
  );
}
