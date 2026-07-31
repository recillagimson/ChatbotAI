/**
 * Read every row a query matches, not just the first page.
 *
 * PostgREST enforces a server-side `max-rows` ceiling (1,000 on this project).
 * It is applied SILENTLY: `.limit(5000)` returns 1,000 rows and no error, no
 * flag, nothing to check. Any count derived from such a read is simply wrong
 * once the table passes a thousand rows, and it's wrong in the direction that
 * hides work - the follow-up queue under-reports, the thread counter plateaus
 * at exactly "1,000", and the two disagree with each other because they
 * truncate different slices.
 *
 * So: page explicitly with `.range()` until a short page proves the end, and
 * report truncation rather than pretending it didn't happen.
 */

export interface PagedResult<T> {
  rows: T[];
  /** True when `maxRows` stopped us before the query was exhausted. */
  truncated: boolean;
}

/** PostgREST's per-request ceiling. Pages larger than this come back clipped. */
export const PAGE_SIZE = 1000;

/**
 * A backstop so a runaway workspace can't turn one page render into hundreds of
 * round trips. Callers that hit it get `truncated: true` and should say so
 * rather than presenting a partial count as a total.
 */
export const DEFAULT_MAX_ROWS = 20_000;

export async function fetchAllRows<T>(
  /** Builds one page of the query. `from`/`to` are inclusive row offsets. */
  page: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
  opts: { maxRows?: number; label?: string } = {}
): Promise<PagedResult<T>> {
  const maxRows = opts.maxRows ?? DEFAULT_MAX_ROWS;
  const rows: T[] = [];

  for (let from = 0; from < maxRows; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, maxRows) - 1;
    const { data, error } = await page(from, to);

    if (error) {
      // Return what we have and mark it short: a partial list the caller knows
      // is partial beats throwing away a page that already arrived.
      console.error(`[paginate] ${opts.label ?? "query"} failed`, error);
      return { rows, truncated: true };
    }

    const batch = data ?? [];
    rows.push(...batch);

    // A short page is the only reliable end-of-results signal.
    if (batch.length < to - from + 1) return { rows, truncated: false };
  }

  return { rows, truncated: true };
}
