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
import { splitIntoMessages, MAX_BUBBLES } from "@/lib/message-split";

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
 * One step in the ordered delivery plan, in the ORDER the tokens/directives appear in the
 * reply: a text segment (split into bubbles at send time), a link flow to fire, or an AI
 * media directive (`[[SEND_ASSET: key]]`) to send. The `media` step carries only the asset
 * key - the webhook resolves it to a real asset (I/O) before sending, so this stays pure.
 */
export type LinkFlowDelivery =
  | { kind: "text"; text: string }
  | { kind: "flow"; ns: string; name: string | null }
  | { kind: "media"; key: string };

/** A `[[SEND_ASSET: key]]` directive with its span in the reply, from lib/ai-media.ts. */
export type MediaMatch = { start: number; end: number; key: string };

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
 * Detect + strip every configured link token AND (when `mediaMatches` are supplied) every
 * `[[SEND_ASSET: key]]` directive, decide which flows to fire, and build an ORDERED
 * delivery plan that interleaves text, flows, and media in the order they appear in the
 * reply. Total.
 *
 * Token matching is longest-first so a shorter token can't partial-match a longer one
 * (e.g. `link_1` won't eat `link_10`). FIRING order, however, follows POSITION in the
 * text, not token length - so a link (or a media asset) lands exactly where the model
 * wrote it. Every matched token/directive is stripped so none can leak. Flows are deduped
 * by namespace and media by asset key: a repeat fires once, at its FIRST occurrence; the
 * later one is still stripped but produces nothing.
 *
 * `deliver` is the ordered sequence the webhook walks (each `text` segment is split into
 * bubbles at send time; each `flow` fires and each `media` asset sends at its authored
 * position). `fired`/`fireFlowNs` are the deduped flows in that same text order (used for
 * the persisted "(sent link:)" markers and the classifier stand-in). `cleanText` is the
 * fully-stripped reply (tokens AND media directives removed), kept for persistence/echo.
 *
 * `mediaMatches` come from lib/ai-media.ts `findAssetDirectives` and are supplied by the
 * caller only when the bot has AI media enabled; omit them and behaviour is unchanged.
 * The caller still owns media dedup-cap-vs-library resolution: this plan carries every
 * first-seen media key in order; the webhook applies MAX_AI_ASSETS and resolves keys.
 */
export function planLinkFlow(input: {
  replyText: string;
  chatbot: LinkFlowConfig;
  platform: Platform;
  mediaMatches?: MediaMatch[];
}): {
  cleanText: string;
  fireFlowNs: string[];
  fired: { ns: string; name: string | null }[];
  tokenFound: boolean;
  deliver: LinkFlowDelivery[];
} {
  const { chatbot, platform } = input;
  const replyText = input.replyText ?? "";
  const mediaMatches = input.mediaMatches ?? [];
  const asText = (t: string): LinkFlowDelivery[] =>
    t ? [{ kind: "text", text: t }] : [];
  if (!replyText) {
    return { cleanText: "", fireFlowNs: [], fired: [], tokenFound: false, deliver: [] };
  }
  const entries = chatbot.link_flow_enabled
    ? resolveLinkFlows(chatbot).filter((e) => e.token.trim())
    : [];
  // Nothing to detect: neither a link trigger nor a media directive. Byte-for-byte the
  // old fast path (disabled bot, or an enabled bot with no config and no media).
  if (!entries.length && !mediaMatches.length) {
    return { cleanText: replyText, fireFlowNs: [], fired: [], tokenFound: false, deliver: asText(replyText) };
  }

  // Ordered, non-overlapping occurrences across the ORIGINAL text: link tokens (longest-
  // first precedence claims character ranges so a shorter token can't sit inside a longer
  // one) plus media directives (already non-overlapping by construction).
  type Occ =
    | { start: number; end: number; kind: "flow"; entry: LinkFlowEntry }
    | { start: number; end: number; kind: "media"; key: string };
  const claimed: { s: number; e: number }[] = [];
  const occ: Occ[] = [];
  // Longest-first is for MATCHING only (stops a short token matching inside a longer one).
  const sorted = [...entries].sort((a, b) => b.token.trim().length - a.token.trim().length);
  for (const e of sorted) {
    const re = new RegExp(escapeRegExp(e.token.trim()) + "[ \\t]*\\n?", "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(replyText)) !== null) {
      if (m[0].length === 0) { re.lastIndex++; continue; } // defensive: never advance zero
      const s = m.index;
      const end = s + m[0].length; // token + the trailing spaces/newline the strip removes
      if (claimed.some((c) => s < c.e && c.s < end)) continue; // overlaps a longer token
      claimed.push({ s, e: end });
      occ.push({ start: s, end, kind: "flow", entry: e });
    }
  }
  for (const mm of mediaMatches) {
    // A media directive that lands inside a claimed link token (pathological) is ignored
    // here; the link token's strip already removes those characters.
    if (claimed.some((c) => mm.start < c.e && c.s < mm.end)) continue;
    occ.push({ start: mm.start, end: mm.end, kind: "media", key: mm.key.toLowerCase() });
  }
  occ.sort((a, b) => a.start - b.start);

  // cleanText: remove every occurrence's span (tokens + directives) from the original and
  // tidy - the same text that used to come out of the two-pass strip (media then links).
  let out = "";
  let c = 0;
  let removedAny = false;
  for (const o of [...occ].sort((a, b) => a.start - b.start)) {
    if (o.start < c) continue; // overlaps an already-removed span
    out += replyText.slice(c, o.start);
    c = o.end;
    removedAny = true;
  }
  out += replyText.slice(c);
  const tokenFound = occ.some((o) => o.kind === "flow");
  const cleanText = removedAny ? tidyText(out) : replyText;

  // Walk occurrences in TEXT order, cutting a new segment only at one that actually fires
  // (a flow with a namespace on this channel, or a first-seen media key). A non-firing
  // occurrence (no flow on this channel, a duplicate ns, or a repeated media key) is
  // stripped in place so the text on both sides joins into one segment.
  const deliver: LinkFlowDelivery[] = [];
  const fired: { ns: string; name: string | null }[] = [];
  const seenNs = new Set<string>();
  const seenKey = new Set<string>();
  let cursor = 0;
  let seg = "";
  const cut = () => {
    const t = tidyText(seg);
    if (t) deliver.push({ kind: "text", text: t });
    seg = "";
  };
  for (const o of occ) {
    if (o.start < cursor) continue; // overlaps an already-consumed span
    seg += replyText.slice(cursor, o.start);
    cursor = o.end;
    if (o.kind === "flow") {
      const ns = selectFlowForEntry(o.entry, platform);
      if (!ns || seenNs.has(ns)) continue; // stripped in place: no cut, no fire
      seenNs.add(ns);
      const name =
        platform === "messenger" && o.entry.ns_fb?.trim() ? o.entry.name_fb : o.entry.name;
      cut();
      deliver.push({ kind: "flow", ns, name: name?.trim() || null });
      fired.push({ ns, name: name?.trim() || null });
    } else {
      if (seenKey.has(o.key)) continue; // duplicate directive: stripped in place
      seenKey.add(o.key);
      cut();
      deliver.push({ kind: "media", key: o.key });
    }
  }
  seg += replyText.slice(cursor);
  const tail = tidyText(seg);
  if (tail) deliver.push({ kind: "text", text: tail });

  // Nothing fired AND no media to send: deliver the plain cleaned text as one block,
  // exactly like a reply with no link/media at all.
  const hasMedia = deliver.some((s) => s.kind === "media");
  if (!fired.length && !hasMedia) {
    return { cleanText, fireFlowNs: [], fired: [], tokenFound, deliver: asText(cleanText) };
  }
  return { cleanText, fireFlowNs: fired.map((f) => f.ns), fired, tokenFound, deliver };
}

/**
 * Expand a delivery plan into ordered, bubble-level steps ready to send: each text
 * segment is split into DM bubbles (splitIntoMessages) and each flow/media step keeps its
 * position. The whole-reply bubble cap is preserved ACROSS segments - each text segment
 * gets a slice of `maxBubbles` (>= 1, reserving one bubble for every later text segment) -
 * so an interleaved multi-link reply never sends more than `maxBubbles` text bubbles in
 * total, exactly as a single-block reply did before interleaving. Flow and media steps are
 * separate sends and keep their positions (bounded by the bot's link_flows / MAX_AI_ASSETS
 * config, not this text-bubble cap). Pure.
 */
export function planDeliveryBubbles(
  deliver: LinkFlowDelivery[],
  maxBubbles: number = MAX_BUBBLES
): LinkFlowDelivery[] {
  const textSegments = deliver.reduce((n, s) => n + (s.kind === "text" ? 1 : 0), 0);
  const out: LinkFlowDelivery[] = [];
  let seen = 0;
  let budget = Math.max(1, Math.floor(maxBubbles));
  for (const step of deliver) {
    if (step.kind !== "text") {
      out.push(step);
      continue;
    }
    seen += 1;
    const later = textSegments - seen; // each later text segment still needs >= 1 bubble
    const segBudget = Math.max(1, budget - later);
    const bubbles = splitIntoMessages(step.text, segBudget);
    for (const text of bubbles) out.push({ kind: "text", text });
    budget = Math.max(0, budget - bubbles.length);
  }
  return out;
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
