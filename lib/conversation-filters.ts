/**
 * Pure URL/query helpers for the Conversations inbox (pagination + date filter).
 * Single source of truth for building /conversations URLs and resolving the date
 * range, so the server page, the chatbot dropdown, the date control, and the pager
 * all compose the SAME params and none can drop another's filter. Unit-tested in
 * scripts/test-conversation-filters.ts (no network / no Date.now — nowMs is passed in).
 */

/** URL/query state for the conversations inbox. Every filter lives in the URL so
 *  views are shareable and the filters compose. */
export type ConvFilterState = {
  platform: string | null;
  chatbot: string | null;
  tag: string | null;
  range: string | null; // date preset key ("1d" | "7d" | "30d"); null = all time
  from: string | null; // custom range start, yyyy-mm-dd
  to: string | null; // custom range end, yyyy-mm-dd (inclusive of that whole day)
  page: number; // 1-based
};

/** Conversations shown per page. */
export const CONV_PAGE_SIZE = 25;

/** Quick date presets in the inbox filter. A null value = All time (no filter). */
export const CONV_DATE_PRESETS: { value: string | null; label: string }[] = [
  { value: null, label: "All time" },
  { value: "1d", label: "Last day" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

const PRESET_DAYS: Record<string, number> = { "1d": 1, "7d": 7, "30d": 30 };
const DAY_MS = 86_400_000;

/** True when a preset key is one we recognize. */
export function isDatePreset(s: string | null | undefined): s is string {
  return typeof s === "string" && s in PRESET_DAYS;
}

/** yyyy-mm-dd shape AND a real calendar date. */
export function isYmd(s: string | null | undefined): s is string {
  return (
    typeof s === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(`${s}T00:00:00.000Z`))
  );
}

/**
 * Resolve the inbox date filter to last_message_at bounds, or null for all-time.
 * A custom from/to (either present) takes precedence over a preset. `nowMs` is
 * passed in (not read via Date.now) so this stays pure and testable. Bounds are
 * UTC and day-granular; `to` covers that entire calendar day (exclusive next-day
 * midnight). Invalid dates are ignored rather than throwing.
 */
export function resolveConversationDateBounds(
  state: Pick<ConvFilterState, "range" | "from" | "to">,
  nowMs: number
): { gte?: string; lt?: string } | null {
  const from = isYmd(state.from) ? state.from : null;
  const to = isYmd(state.to) ? state.to : null;
  if (from || to) {
    const bounds: { gte?: string; lt?: string } = {};
    if (from) bounds.gte = `${from}T00:00:00.000Z`;
    if (to) bounds.lt = nextDayUtcIso(to);
    return bounds;
  }
  const days = isDatePreset(state.range) ? PRESET_DAYS[state.range] : undefined;
  if (!days) return null; // "all" / unknown / unset -> no date filter
  return { gte: new Date(nowMs - days * DAY_MS).toISOString() };
}

function nextDayUtcIso(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

/**
 * Build a /conversations URL from the current filter state + a patch. Any change
 * that is NOT a page change resets to page 1, so paging never points past a newly
 * filtered result set. Empty/null values are omitted from the querystring.
 */
export function buildConversationsHref(
  current: ConvFilterState,
  patch: Partial<ConvFilterState>
): string {
  const m = { ...current, ...patch };
  // A patch that touches `page` is a pager click (keep it); anything else is a
  // filter change (back to page 1).
  const page = "page" in patch ? Math.max(1, Math.floor(patch.page ?? 1) || 1) : 1;
  const params = new URLSearchParams();
  if (m.platform) params.set("platform", m.platform);
  if (m.chatbot) params.set("chatbot", m.chatbot);
  if (m.tag) params.set("tag", m.tag);
  if (m.range) params.set("range", m.range);
  if (m.from) params.set("from", m.from);
  if (m.to) params.set("to", m.to);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/conversations?${qs}` : "/conversations";
}
