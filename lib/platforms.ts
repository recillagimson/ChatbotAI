// lib/platforms.ts
// Single source of truth for the messaging channels we support through ManyChat.
// Everything platform-aware (webhook ingest, outbound send, inbox tabs, follow-ups)
// reads from here so adding/upgrading a channel is a one-line change.
//
// ManyChat facts baked in (verified against ManyChat docs):
//  - sendContent's `content.type` is the channel key for instagram/messenger/
//    whatsapp/telegram (Facebook Messenger's type is "messenger").
//  - TikTok messaging is beta with NO send API yet, so canPush=false: we ingest
//    the DM + generate a reply and return it in the webhook RESPONSE for the
//    client's TikTok flow to deliver. Flip `manychatType` + `canPush` when
//    ManyChat ships TikTok sending and delivery upgrades to push automatically.

export type Platform = "instagram" | "messenger" | "whatsapp" | "telegram" | "tiktok";

export const PLATFORMS: Platform[] = [
  "instagram",
  "messenger",
  "whatsapp",
  "telegram",
  "tiktok",
];

export interface PlatformMeta {
  /** Human label shown in the inbox tabs/badges. */
  label: string;
  /** ManyChat sendContent `content.type`, or null if the channel has no send API. */
  manychatType: string | null;
  /** True if replies can be pushed via ManyChat's sendContent API. */
  canPush: boolean;
  /**
   * Days after the contact's last message during which an out-of-window follow-up
   * can still be delivered, or null if the channel has no window / can't push.
   */
  followupWindowDays: number | null;
}

export const PLATFORM_META: Record<Platform, PlatformMeta> = {
  instagram: { label: "Instagram", manychatType: "instagram", canPush: true, followupWindowDays: 7 },
  messenger: { label: "Facebook", manychatType: "messenger", canPush: true, followupWindowDays: 7 },
  whatsapp: { label: "WhatsApp", manychatType: "whatsapp", canPush: true, followupWindowDays: 1 },
  telegram: { label: "Telegram", manychatType: "telegram", canPush: true, followupWindowDays: null },
  tiktok: { label: "TikTok", manychatType: null, canPush: false, followupWindowDays: null },
};

/** The default channel for inbound messages that don't declare one (legacy IG flow). */
export const DEFAULT_PLATFORM: Platform = "instagram";

/** Type guard: is the value one of our known platform keys? */
export function isPlatform(v: unknown): v is Platform {
  return typeof v === "string" && (PLATFORMS as string[]).includes(v);
}

/** Coerce arbitrary input to a Platform, falling back to the default. */
export function toPlatform(v: unknown): Platform {
  return isPlatform(v) ? v : DEFAULT_PLATFORM;
}

/** Display label for a platform (safe for unknown values). */
export function platformLabel(v: unknown): string {
  return isPlatform(v) ? PLATFORM_META[v].label : PLATFORM_META[DEFAULT_PLATFORM].label;
}

/** Can replies on this platform be pushed via ManyChat's API? */
export function canPushPlatform(v: unknown): boolean {
  return isPlatform(v) ? PLATFORM_META[v].canPush : false;
}
