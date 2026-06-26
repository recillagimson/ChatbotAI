import { Instagram, Facebook, Send, MessageCircle, Music2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Platform, PLATFORM_META, toPlatform } from "@/lib/platforms";

// Brand-ish color + icon per channel. lucide lacks WhatsApp/TikTok marks, so we
// approximate (Music2 for TikTok, MessageCircle for WhatsApp) with a colored chip.
const STYLE: Record<Platform, { cls: string; Icon: typeof Instagram }> = {
  instagram: { cls: "bg-pink-100 text-pink-700", Icon: Instagram },
  messenger: { cls: "bg-blue-100 text-blue-700", Icon: Facebook },
  whatsapp: { cls: "bg-green-100 text-green-700", Icon: MessageCircle },
  telegram: { cls: "bg-sky-100 text-sky-700", Icon: Send },
  tiktok: { cls: "bg-zinc-200 text-zinc-800", Icon: Music2 },
};

/** Small labelled platform chip for conversation rows / detail headers. */
export function PlatformBadge({
  platform,
  className,
  showLabel = true,
}: {
  platform: unknown;
  className?: string;
  showLabel?: boolean;
}) {
  const p = toPlatform(platform);
  const { cls, Icon } = STYLE[p];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        cls,
        className
      )}
      title={PLATFORM_META[p].label}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {showLabel && PLATFORM_META[p].label}
    </span>
  );
}
