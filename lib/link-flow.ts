/**
 * Link-via-ManyChat delegation (pure, unit-tested, no I/O).
 *
 * A bot can be told to emit a marker keyword to signal "send this link now". This
 * module detects every configured keyword in a reply, strips them, and reports which
 * ManyChat flows to fire for the lead's channel. The webhook then calls
 * `sendManychatFlow`, so links are delivered by the owner's native ManyChat automations
 * instead of raw URLs (which Instagram silently strips).
 *
 * Multi-link: `link_flows` is an array of {token, ns, name, ns_fb, name_fb}. When empty,
 * the legacy single `link_flow_*` columns are used as one entry, so bots configured before
 * multi-link keep working unchanged. Per channel: Messenger uses ns_fb, falling back to ns;
 * Instagram never uses ns_fb (mirrors lib/followup.ts selectFlow).
 */
import type { Chatbot, LinkFlowEntry } from "@/lib/types";
import type { Platform } from "@/lib/platforms";

export type { LinkFlowEntry } from "@/lib/types";

export const DEFAULT_LINK_FLOW_TOKEN = "[[SEND_LINK]]";

export type LinkFlowConfig = Pick<
  Chatbot,
  | "link_flow_enabled"
  | "link_flow_ns"
  | "link_flow_name"
  | "link_flow_ns_fb"
  | "link_flow_name_fb"
  | "link_flow_token"
  | "link_flows"
>;

/** The configured legacy emit-token, trimmed, falling back to the default when blank. */
export function resolveLinkFlowToken(chatbot: LinkFlowConfig): string {
  return (chatbot.link_flow_token ?? "").trim() || DEFAULT_LINK_FLOW_TOKEN;
}

/** Escape a literal string for use inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Coerce the untyped jsonb `link_flows` into a validated entry list. Total. */
export function parseLinkFlows(raw: unknown): LinkFlowEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: LinkFlowEntry[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const token = typeof o.token === "string" ? o.token : "";
    const ns = typeof o.ns === "string" ? o.ns : "";
    const nsFb = typeof o.ns_fb === "string" ? o.ns_fb : "";
    // Useful only with a token AND at least one flow.
    if (!token.trim() || (!ns.trim() && !nsFb.trim())) continue;
    out.push({
      token,
      ns,
      name: typeof o.name === "string" ? o.name : null,
      ns_fb: nsFb.trim() ? nsFb : null,
      name_fb: typeof o.name_fb === "string" ? o.name_fb : null,
    });
  }
  return out;
}

/**
 * The effective list of link triggers. `link_flows` wins when non-empty; otherwise the
 * legacy single columns become one entry; otherwise empty.
 */
export function resolveLinkFlows(chatbot: LinkFlowConfig): LinkFlowEntry[] {
  const list = parseLinkFlows(chatbot.link_flows);
  if (list.length) return list;
  const ns = chatbot.link_flow_ns?.trim() || "";
  const nsFb = chatbot.link_flow_ns_fb?.trim() || "";
  if (!ns && !nsFb) return [];
  return [
    {
      token: resolveLinkFlowToken(chatbot),
      ns,
      name: chatbot.link_flow_name ?? null,
      ns_fb: nsFb || null,
      name_fb: chatbot.link_flow_name_fb ?? null,
    },
  ];
}

/** Flow ns for one entry on this channel, or null. Messenger falls back to ns; IG never uses fb. */
function selectFlowForEntry(entry: LinkFlowEntry, platform: Platform): string | null {
  const ig = entry.ns?.trim() || null;
  const fb = entry.ns_fb?.trim() || null;
  if (platform === "messenger") return fb || ig || null;
  return ig || null;
}

/**
 * Retained for existing callers/tests: the flow for the FIRST effective entry on this
 * channel. New code should use planLinkFlow.
 */
export function selectLinkFlow(
  chatbot: LinkFlowConfig,
  platform: Platform
): { ns: string; name: string | null } | null {
  const first = resolveLinkFlows(chatbot)[0];
  if (!first) return null;
  const ns = selectFlowForEntry(first, platform);
  if (!ns) return null;
  const name = platform === "messenger" && first.ns_fb?.trim() ? first.name_fb : first.name;
  return { ns, name: name ?? null };
}

/**
 * Detect + strip every configured link token and decide which flows to fire. Total.
 * Tokens are matched longest-first so a shorter token can't partial-match a longer one
 * (e.g. `link_1` won't eat `link_10`). Every matched token is stripped so none can leak.
 * Returned namespaces are deduped (two tokens -> same flow fires once).
 */
export function planLinkFlow(input: {
  replyText: string;
  chatbot: LinkFlowConfig;
  platform: Platform;
}): { cleanText: string; fireFlowNs: string[]; tokenFound: boolean } {
  const { replyText, chatbot, platform } = input;
  if (!chatbot.link_flow_enabled || !replyText) {
    return { cleanText: replyText ?? "", fireFlowNs: [], tokenFound: false };
  }
  const entries = resolveLinkFlows(chatbot).filter((e) => e.token.trim());
  if (!entries.length) {
    return { cleanText: replyText, fireFlowNs: [], tokenFound: false };
  }
  const sorted = [...entries].sort(
    (a, b) => b.token.trim().length - a.token.trim().length
  );
  let text = replyText;
  const fireFlowNs: string[] = [];
  const seen = new Set<string>();
  for (const e of sorted) {
    const token = e.token.trim();
    const re = new RegExp(escapeRegExp(token) + "[ \\t]*\\n?", "gi");
    const before = text;
    text = text.replace(re, "");
    if (text.length === before.length) continue; // token not present
    const ns = selectFlowForEntry(e, platform);
    if (ns && !seen.has(ns)) {
      seen.add(ns);
      fireFlowNs.push(ns);
    }
  }
  const tokenFound = text.length !== replyText.length;
  const cleanText = tokenFound
    ? text
        .replace(/[ \t]{2,}/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
    : replyText;
  return { cleanText, fireFlowNs, tokenFound };
}

/**
 * System-prompt block. One entry -> the original single-token wording (byte-for-byte, so
 * existing bots' prompts don't change). Multiple entries -> a compact token->link list.
 * Empty unless enabled AND at least one entry has a flow.
 */
export function linkFlowPromptBlock(chatbot: LinkFlowConfig): string {
  if (!chatbot.link_flow_enabled) return "";
  const entries = resolveLinkFlows(chatbot).filter(
    (e) => e.token.trim() && (e.ns?.trim() || e.ns_fb?.trim())
  );
  if (!entries.length) return "";
  if (entries.length === 1) {
    const token = entries[0].token.trim();
    return `LINK DELIVERY - when it's time to share the signup link, write ${token} on its OWN line and do NOT paste any URL or tell them to check your bio. The system detects ${token} and delivers the link for you. Only write it when you actually mean to send that link, and never show ${token} to the person as visible text.`;
  }
  const lines = entries
    .map((e) => `  ${e.token.trim()} = sends ${e.name?.trim() || "that link"}`)
    .join("\n");
  return `LINK DELIVERY - you can send a specific link by writing one of the tokens below on its OWN line. Do NOT paste any URL or tell them to check your bio; the system detects the token and delivers that link for you. Only write a token when you actually mean to send that link, and never show a token to the person as visible text.\n${lines}`;
}
