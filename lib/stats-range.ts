/**
 * The custom date range on /statistics, as the two date inputs report it.
 *
 * A native <input type="date"> is not a text box. While a segment is half
 * typed it reports "", and Chromium reports a complete but wrong date after the
 * first digit of a year ("0002-05-01", then "0020-05-01", "0202-05-01") or of
 * a month ("2026-01-01" on the way to 12). The page resolves the URL with
 * resolveRange(), which drops an empty, unparseable or backwards range and falls
 * back to the 30-day preset, clearing both inputs. So the bar keeps the edit
 * local and only navigates with what these helpers accept.
 *
 * No imports on purpose: this runs in the client bundle, and lib/analytics.ts
 * stays a type-only import there.
 */

/**
 * yyyy-mm-dd whose year does not start with 0. Every partial year Chromium
 * reports while a year is being typed is below 1000, so this is what rules them
 * out; nobody means a range in the first millennium.
 */
const DAY = /^[1-9]\d{3}-\d{2}-\d{2}$/;

/**
 * A real calendar day, and not a year still being typed.
 *
 * The round trip matters: Date rolls an impossible day over ("2026-02-30"
 * parses as 2 March), so parsing alone would accept it, and resolveRange()
 * would then compare the rolled-over instant and could reject a pair whose
 * strings are in order. In UTC so no time zone can skip the day.
 */
export function isCompleteDay(value: string): boolean {
  if (!DAY.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return (
    d.getUTCFullYear() === Number(value.slice(0, 4)) &&
    d.getUTCMonth() + 1 === Number(value.slice(5, 7)) &&
    d.getUTCDate() === Number(value.slice(8, 10))
  );
}

/**
 * The range to navigate to, or null to keep the edit in the inputs.
 *
 * Both ends must be real days with from <= to. For real days yyyy-mm-dd
 * compares correctly as a string, and it is the order resolveRange() applies,
 * so a range pushed from here is never thrown away by the page. `current` is
 * the range this bar last navigated to (or the committed one); pushing it again
 * would only repeat the same server render.
 */
export function customRangeToPush(
  from: string,
  to: string,
  current: { from: string; to: string },
): { from: string; to: string } | null {
  if (!isCompleteDay(from) || !isCompleteDay(to) || from > to) return null;
  if (from === current.from && to === current.to) return null;
  return { from, to };
}
