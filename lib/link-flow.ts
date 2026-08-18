/**
 * Link-via-ManyChat delegation (pure, unit-tested, no I/O).
 *
 * When a chatbot has `link_flow_enabled` and a flow configured, the reply model is
 * told to emit a marker token (default `[[SEND_LINK]]`) to signal "send the signup
 * link now". This module detects the token, strips it from the reply, and reports
 * which ManyChat flow to fire for the lead's channel. The webhook then calls
 * `sendManychatFlow`, so the link is delivered by the owner's native ManyChat
 * automation instead of a raw URL (which Instagram silently strips).
 *
 * Mirrors the follow-up "Option B" flow delegation (lib/followup.ts selectFlow):
 * Messenger uses `link_flow_ns_fb`, falling back to `link_flow_ns`.
 */
import type { Chatbot } from "@/lib/types";
import type { Platform } from "@/lib/platforms";

export const DEFAULT_LINK_FLOW_TOKEN = "[[SEND_LINK]]";

export type LinkFlowConfig = Pick<
  Chatbot,
  | "link_flow_enabled"
  | "link_flow_ns"
  | "link_flow_name"
  | "link_flow_ns_fb"
  | "link_flow_name_fb"
  | "link_flow_token"
>;

/** The configured emit-token, trimmed, falling back to the default when blank. */
export function resolveLinkFlowToken(chatbot: LinkFlowConfig): string {
  return (chatbot.link_flow_token ?? "").trim() || DEFAULT_LINK_FLOW_TOKEN;
}

/** Escape a literal string for use inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The flow to fire for this channel, or null if none is set. Instagram/WhatsApp/
 * Telegram/default use link_flow_ns; Messenger uses link_flow_ns_fb and falls back
 * to link_flow_ns (matching lib/followup.ts selectFlow). Instagram never uses the fb flow.
 */
export function selectLinkFlow(
  chatbot: LinkFlowConfig,
  platform: Platform
): { ns: string; name: string | null } | null {
  const igNs = chatbot.link_flow_ns?.trim() || null;
  const fbNs = chatbot.link_flow_ns_fb?.trim() || null;
  if (platform === "messenger") {
    if (fbNs) return { ns: fbNs, name: chatbot.link_flow_name_fb ?? null };
    if (igNs) return { ns: igNs, name: chatbot.link_flow_name ?? null };
    return null;
  }
  return igNs ? { ns: igNs, name: chatbot.link_flow_name ?? null } : null;
}

/**
 * Detect + strip the link-flow token and decide which flow to fire. Total (never
 * throws). When disabled or the token is absent, returns the text unchanged and no
 * flow. The token is ALWAYS stripped when found (so it can never leak to the lead),
 * even if no flow is configured for the channel.
 */
export function planLinkFlow(input: {
  replyText: string;
  chatbot: LinkFlowConfig;
  platform: Platform;
}): { cleanText: string; fireFlowNs: string | null; tokenFound: boolean } {
  const { replyText, chatbot, platform } = input;
  if (!chatbot.link_flow_enabled || !replyText) {
    return { cleanText: replyText ?? "", fireFlowNs: null, tokenFound: false };
  }
  const token = resolveLinkFlowToken(chatbot);
  const re = new RegExp(escapeRegExp(token) + "[ \\t]*\\n?", "gi");
  const stripped = replyText.replace(re, "");
  if (stripped.length === replyText.length) {
    return { cleanText: replyText, fireFlowNs: null, tokenFound: false };
  }
  const cleanText = stripped
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const flow = selectLinkFlow(chatbot, platform);
  return { cleanText, fireFlowNs: flow?.ns ?? null, tokenFound: true };
}

/**
 * System-prompt block telling the model to emit the token instead of pasting the
 * signup link. Empty unless the feature is on AND at least one flow is configured.
 */
export function linkFlowPromptBlock(chatbot: LinkFlowConfig): string {
  if (!chatbot.link_flow_enabled) return "";
  const hasFlow = !!(chatbot.link_flow_ns?.trim() || chatbot.link_flow_ns_fb?.trim());
  if (!hasFlow) return "";
  const token = resolveLinkFlowToken(chatbot);
  return `LINK DELIVERY - when it's time to share the signup link, write ${token} on its OWN line and do NOT paste any URL or tell them to check your bio. The system detects ${token} and delivers the link for you. Only write it when you actually mean to send that link, and never show ${token} to the person as visible text.`;
}
