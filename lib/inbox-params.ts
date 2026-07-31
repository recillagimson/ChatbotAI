/**
 * Parse raw `searchParams` into a validated [ConvFilterState].
 *
 * Both inbox routes render the same list pane, so both need the same parsing -
 * and validating here (rather than trusting the query string) is what stops a
 * hand-edited `?tag=` or `?quality=` from reaching a query.
 */
import { isPlatform } from "@/lib/platforms";
import { isTag } from "@/lib/conversation-tags";
import { isQualityTag } from "@/lib/conversation-quality";
import {
  cleanQuery,
  isDatePreset,
  isYmd,
  type ConvFilterState,
} from "@/lib/conversation-filters";

export function readInboxFilters(
  sp: Record<string, string | undefined>
): ConvFilterState {
  return {
    platform: isPlatform(sp.platform) ? sp.platform : null,
    // The chatbot scope is shared with the shell's `?bot=` switcher; `?chatbot=`
    // stays supported so older bookmarks keep working. Not validated against the
    // user's bot list here - every query is also `.eq("user_id", …)`, so an
    // unknown id narrows to nothing rather than reaching another workspace.
    chatbot: sp.bot ?? sp.chatbot ?? null,
    tag: isTag(sp.tag) ? sp.tag : null,
    quality: isQualityTag(sp.quality) ? sp.quality : null,
    range: isDatePreset(sp.range) ? sp.range : null,
    from: isYmd(sp.from) ? sp.from : null,
    to: isYmd(sp.to) ? sp.to : null,
    q: cleanQuery(sp.q),
    page: Math.max(1, Math.floor(Number(sp.page)) || 1),
  };
}

/**
 * A stable string for the current filter state, used as a Suspense `key`.
 *
 * Both inbox routes drive filtering, search and paging through the query string
 * on the SAME route segment, which never triggers `loading.tsx`. Keying the
 * boundary on this value is what makes React drop the old list and show a
 * skeleton the moment any of them changes. Field order is fixed so the same
 * filters always produce the same key.
 */
export function inboxKey(f: ConvFilterState): string {
  return [
    f.platform,
    f.chatbot,
    f.tag,
    f.quality,
    f.range,
    f.from,
    f.to,
    f.q,
    f.page,
  ].join("|");
}
