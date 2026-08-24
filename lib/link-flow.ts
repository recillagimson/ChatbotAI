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
 * One step in the ordered delivery plan: a text segment (split into bubbles at send
 * time) or a link flow to fire, in the ORDER the tokens appear in the reply.
 */
export type LinkFlowDelivery =
  | { kind: "text"; text: string }
  | { kind: "flow"; ns: string; name: string | null };

/** Collapse runs of spaces/tabs, drop trailing space before a newline, and cap blank
 *  runs at one blank line - the same tidy the fully-stripped reply gets. */
function tidyText(s: string): string {
  return s
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Detect + strip every configured link token, decide which flows to fire, and build an
 * ORDERED delivery plan that interleaves text and flows in the order the tokens appear
 * in the reply. Total.
 *
 * Matching is longest-first so a shorter token can't partial-match a longer one (e.g.
 * `link_1` won't eat `link_10`). FIRING order, however, follows token POSITION in the
 * text, not token length - so a link lands exactly where the model wrote its token.
 * Every matched token is stripped so none can leak. Flows are deduped by namespace: two
 * tokens mapping to the same flow fire once, at the FIRST occurrence in the text; the
 * later token is still stripped but fires nothing.
 *
 * `deliver` is the ordered sequence the webhook walks (each `text` segment is split into
 * bubbles at send time; each `flow` fires at its authored position). `fired`/`fireFlowNs`
 * are the deduped flows in that same text order (used for the persisted "(sent link:)"
 * markers and the classifier stand-in). `cleanText` is the fully-stripped reply, kept
 * unchanged for persistence/echo.
 */
export function planLinkFlow(input: {
  replyText: string;
  chatbot: LinkFlowConfig;
  platform: Platform;
}): {
  cleanText: string;
  fireFlowNs: string[];
  fired: { ns: string; name: string | null }[];
  tokenFound: boolean;
  deliver: LinkFlowDelivery[];
} {
  const { replyText, chatbot, platform } = input;
  const asText = (t: string): LinkFlowDelivery[] =>
    t ? [{ kind: "text", text: t }] : [];
  if (!chatbot.link_flow_enabled || !replyText) {
    const text = replyText ?? "";
    return { cleanText: text, fireFlowNs: [], fired: [], tokenFound: false, deliver: asText(text) };
  }
  const entries = resolveLinkFlows(chatbot).filter((e) => e.token.trim());
  if (!entries.length) {
    return { cleanText: replyText, fireFlowNs: [], fired: [], tokenFound: false, deliver: asText(replyText) };
  }
  // Longest-first is for MATCHING only (stops a short token matching inside a longer one).
  const sorted = [...entries].sort(
    (a, b) => b.token.trim().length - a.token.trim().length
  );

  // cleanText: strip every token, longest-first, exactly as before (persisted + echoed).
  let stripped = replyText;
  for (const e of sorted) {
    const re = new RegExp(escapeRegExp(e.token.trim()) + "[ \\t]*\\n?", "gi");
    stripped = stripped.replace(re, "");
  }
  const tokenFound = stripped.length !== replyText.length;
  const cleanText = tokenFound ? tidyText(stripped) : replyText;

  // Ordered, non-overlapping token occurrences across the ORIGINAL text. Longest-first
  // precedence claims character ranges so a shorter token can't sit inside a longer one.
  type Occ = { start: number; end: number; entry: LinkFlowEntry };
  const claimed: { s: number; e: number }[] = [];
  const occ: Occ[] = [];
  for (const e of sorted) {
    const re = new RegExp(escapeRegExp(e.token.trim()) + "[ \\t]*\\n?", "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(replyText)) !== null) {
      if (m[0].length === 0) { re.lastIndex++; continue; } // defensive: never advance zero
      const s = m.index;
      const end = s + m[0].length; // token + the trailing spaces/newline the strip removes
      if (claimed.some((c) => s < c.e && c.s < end)) continue; // overlaps a longer token
      claimed.push({ s, e: end });
      occ.push({ start: s, end, entry: e });
    }
  }
  occ.sort((a, b) => a.start - b.start);

  // Walk occurrences in TEXT order, cutting a new segment only at a token that actually
  // fires. A non-firing token (no flow on this channel, or a duplicate ns) is stripped in
  // place so the text on both sides joins into one segment.
  const deliver: LinkFlowDelivery[] = [];
  const fired: { ns: string; name: string | null }[] = [];
  const seen = new Set<string>();
  let cursor = 0;
  let seg = "";
  for (const o of occ) {
    seg += replyText.slice(cursor, o.start);
    cursor = o.end;
    const ns = selectFlowForEntry(o.entry, platform);
    if (!ns || seen.has(ns)) continue; // stripped in place: no cut, no fire
    seen.add(ns);
    const name =
      platform === "messenger" && o.entry.ns_fb?.trim() ? o.entry.name_fb : o.entry.name;
    const t = tidyText(seg);
    if (t) deliver.push({ kind: "text", text: t });
    deliver.push({ kind: "flow", ns, name: name?.trim() || null });
    fired.push({ ns, name: name?.trim() || null });
    seg = "";
  }
  seg += replyText.slice(cursor);
  const tail = tidyText(seg);
  if (tail) deliver.push({ kind: "text", text: tail });

  // Tokens present but nothing fired on this channel: deliver the plain cleaned text as
  // one block, exactly like a reply with no link at all.
  if (!fired.length) {
    return { cleanText, fireFlowNs: [], fired: [], tokenFound, deliver: asText(cleanText) };
  }
  return { cleanText, fireFlowNs: fired.map((f) => f.ns), fired, tokenFound, deliver };
}

/**
 * The persisted trace of a fired link flow, mirroring the "(sent image: key)" rows
 * asset sends leave. Without a stored trace the model's own history shows a close
 * that says "use this link" with no link attached - a promise it then "keeps" by
 * sending the link again on the next nudge.
 */
export function linkSentMarker(name: string | null): string {
  return `(sent link: ${name?.trim() || "link"})`;
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
