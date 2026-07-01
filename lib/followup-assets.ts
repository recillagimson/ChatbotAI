/**
 * Follow-up asset library helpers — shared by the cron drip engine, the webhook
 * AI-media path, and the system-prompt builder.
 *
 * A FollowupAsset is a reusable media (image/video/audio) or link asset with a
 * short `key`. Steps and AI `[[SEND_ASSET: key]]` directives reference assets by
 * key; here we resolve keys → assets → the {kind,url} shape the ManyChat sender
 * (sendManychatMedia) consumes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FollowupAsset } from "./types";
import type { OutboundAsset } from "./manychat";

const ASSET_COLUMNS =
  "id, chatbot_id, user_id, key, label, description, kind, storage_path, url, mime, created_at";

/** All follow-up assets for a chatbot, oldest first. Never throws (returns []). */
export async function fetchFollowupAssets(
  supabase: SupabaseClient,
  chatbotId: string
): Promise<FollowupAsset[]> {
  const { data, error } = await supabase
    .from("followup_assets")
    .select(ASSET_COLUMNS)
    .eq("chatbot_id", chatbotId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[followup-assets] fetch failed", error);
    return [];
  }
  return (data ?? []) as FollowupAsset[];
}

/** Case-insensitive lookup of an asset by its key. */
export function resolveAssetByKey(
  assets: FollowupAsset[],
  key: string | null | undefined
): FollowupAsset | null {
  if (!key) return null;
  const k = key.trim().toLowerCase();
  return assets.find((a) => a.key.trim().toLowerCase() === k) ?? null;
}

/** Map an asset to the {kind,url} the ManyChat media sender needs; null if no URL. */
export function assetToOutbound(asset: FollowupAsset | null | undefined): OutboundAsset | null {
  if (!asset?.url) return null;
  return { kind: asset.kind, url: asset.url };
}

/** Resolve a list of asset keys to sendable outbound assets (skips missing/urless). */
export function resolveOutboundAssets(
  assets: FollowupAsset[],
  keys: string[]
): OutboundAsset[] {
  return keys
    .map((k) => assetToOutbound(resolveAssetByKey(assets, k)))
    .filter((a): a is OutboundAsset => a !== null);
}

/**
 * Compact catalog of usable assets for the AI system prompt so the model knows
 * which keys it may emit. One line per asset: `- key (kind): description`.
 * Empty string when there are no usable assets.
 */
export function buildAssetCatalogBlock(assets: FollowupAsset[]): string {
  const usable = assets.filter((a) => a.url);
  if (usable.length === 0) return "";
  return usable
    .map((a) => {
      const note = a.description?.trim() || a.label?.trim() || "";
      return `- ${a.key} (${a.kind})${note ? `: ${note}` : ""}`;
    })
    .join("\n");
}
