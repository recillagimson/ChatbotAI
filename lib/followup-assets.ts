/**
 * Follow-up asset library helpers - shared by the cron drip engine, the webhook
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

// "*" so a column added later (tiktok_flow_*) can't break every media read before its
// migration is applied.
const ASSET_COLUMNS = "*";

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

/**
 * What a response channel (TikTok) sends for a library item, or null when it can't send
 * it: the item's own ManyChat flow when one is set and the bot has an API key to start it
 * (any kind - the flow holds whatever the owner put in it), else the picture itself for
 * the owner's flow to send from media_key. TikTok has no video or audio block.
 */
export function responseChannelMedia(
  asset: FollowupAsset | null | undefined,
  canStartFlow: boolean
): { key: string; url: string; flowNs?: string } | null {
  if (!asset?.url) return null;
  if (canStartFlow && asset.tiktok_flow_ns) {
    return { key: asset.key, url: asset.url, flowNs: asset.tiktok_flow_ns };
  }
  return asset.kind === "image" ? { key: asset.key, url: asset.url } : null;
}

// A ManyChat flow ns, e.g. "content20260820161624_714889".
const FLOW_NS_RE = /^[A-Za-z0-9_.:-]{1,200}$/;

/**
 * Validate a Media-tab edit. Only the label, the "When to send" text and the TikTok flow
 * can change: the key, file and kind stay fixed because follow-up steps, keyword replies
 * and KB text find an item by key. Fields absent from the body are left alone; a blank
 * one clears it, and the flow's name travels with its ns. Pure + unit-tested.
 */
export function assetEditPatch(
  body: Record<string, unknown>
): { ok: true; patch: Record<string, string | null> } | { ok: false; error: string } {
  const patch: Record<string, string | null> = {};
  const text = (field: string, max: number, name: string): string | null | Error => {
    const v = body[field];
    if (v === null || v === undefined) return null;
    if (typeof v !== "string") return new Error(`${name} must be text.`);
    const t = v.trim();
    if (t.length > max) return new Error(`${name} must be at most ${max} characters.`);
    return t || null;
  };
  const fields: [string, number, string][] = [
    ["label", 200, "Label"],
    ["description", 2000, "When to send"],
  ];
  for (const [field, max, name] of fields) {
    if (!(field in body)) continue;
    const v = text(field, max, name);
    if (v instanceof Error) return { ok: false, error: v.message };
    patch[field] = v;
  }
  if ("tiktok_flow_ns" in body) {
    const ns = text("tiktok_flow_ns", 200, "TikTok flow");
    if (ns instanceof Error) return { ok: false, error: ns.message };
    if (ns !== null && !FLOW_NS_RE.test(ns)) return { ok: false, error: "That TikTok flow isn't valid." };
    const name = ns === null ? null : text("tiktok_flow_name", 200, "Flow name");
    if (name instanceof Error) return { ok: false, error: name.message };
    patch.tiktok_flow_ns = ns;
    patch.tiktok_flow_name = name;
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: "Nothing to change." };
  return { ok: true, patch };
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
 * Generate `count` unique asset keys of the form `{base}_{n}` (n from 1), skipping
 * any key already present in `existing` (case-insensitive) AND any already produced
 * in this batch. Used by the Media tab's bulk-image upload so several images added
 * at once get distinct, collision-free keys (`results_1`, `results_2`, …), and a
 * re-upload with the same base continues past the taken numbers. Pure/deterministic.
 */
export function nextAssetKeys(base: string, count: number, existing: string[]): string[] {
  const b = base.trim().toLowerCase();
  const taken = new Set(existing.map((k) => k.trim().toLowerCase()));
  const out: string[] = [];
  let n = 1;
  while (out.length < count) {
    const candidate = `${b}_${n}`;
    if (!taken.has(candidate)) {
      out.push(candidate);
      taken.add(candidate);
    }
    n += 1;
  }
  return out;
}

/**
 * Normalized asset keys for a follow-up step: prefers the new `asset_keys` array,
 * falls back to the legacy single `asset_key`. Trims, lowercases, de-dupes, drops
 * empties. Pure/deterministic - the single back-compat read used by the editor,
 * resolveSteps, the cron, and the page's usedKeys, so old single-asset steps (saved
 * before multi-asset) keep working.
 */
export function stepAssetKeys(
  step:
    | {
        asset_key?: string | null;
        asset_keys?: string[] | null;
      }
    | null
    | undefined
): string[] {
  if (!step || typeof step !== "object") return []; // JSONB can hold a null/garbage element
  const raw =
    Array.isArray(step.asset_keys) && step.asset_keys.length
      ? step.asset_keys
      : step.asset_key
        ? [step.asset_key]
        : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of raw) {
    const key = (k ?? "").trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
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
