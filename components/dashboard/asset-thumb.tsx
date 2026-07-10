"use client";

import { ImageIcon, Film, Mic, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FollowupAssetKind } from "@/lib/types";

/**
 * Small square media preview tile for a follow-up asset. Renders by `kind`:
 * image → <img>, video → <video> (first frame as poster), audio/link/urless →
 * a kind icon. Works with a public Supabase URL OR a local blob: URL, so it
 * previews both existing assets and files picked but not yet uploaded.
 *
 * Raw <img>/<video> (not next/image) — the followup-assets bucket is public and
 * there's no CSP / next.config image restriction, so remote URLs render directly.
 */
export function AssetThumb({
  kind,
  url,
  className,
}: {
  kind: FollowupAssetKind;
  url?: string | null;
  className?: string;
}) {
  const box = cn("h-14 w-14 shrink-0 rounded-md border bg-muted object-cover", className);
  if (kind === "image" && url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" loading="lazy" className={box} />;
  }
  if (kind === "video" && url) {
    return <video src={url} muted playsInline preload="metadata" className={box} />;
  }
  const Icon = kind === "audio" ? Mic : kind === "link" ? Link2 : kind === "video" ? Film : ImageIcon;
  return (
    <div className={cn(box, "grid place-items-center text-muted-foreground")}>
      <Icon className="h-5 w-5" />
    </div>
  );
}
