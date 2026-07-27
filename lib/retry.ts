/**
 * Retry a Supabase-style call (one that resolves to a `{ data, error }` response and
 * does NOT throw on a query error) a few times before giving up, returning the raw
 * response so callers destructure `{ data, error }` exactly as they would without it.
 *
 * For the inbound webhook the point is durability: a transient Postgres/network blip
 * while recording the inbound message must not silently drop it — retry a couple of
 * times first.
 *
 * BOUNDED latency: these calls run on the synchronous PRE-ACK path (before the webhook
 * fast-acks under ManyChat's ~10s External Request timeout), and a "blip" often shows
 * up as a SLOW call, not an instant error. So each attempt is capped by `timeoutMs`
 * via an AbortSignal that actually cancels the query (fn must forward it to supabase's
 * `.abortSignal(signal)`); on timeout the attempt aborts and is retried. Worst-case
 * added time is `attempts * timeoutMs + sum(backoff)` — with the defaults, ~6.35s —
 * instead of the UNBOUNDED wait a plain un-timed call (the pre-change code) would incur
 * on a stalled connection. `sleep` is injectable so the retry logic is unit-testable
 * without real delays.
 *
 * Generic over the whole response `R` (not just its data) so it composes with the
 * Supabase query builder's discriminated-union return type without fighting inference.
 */
export async function retrySupabase<R extends { data: unknown; error: unknown }>(
  fn: (signal: AbortSignal) => PromiseLike<R>,
  opts: {
    attempts?: number;
    backoffMs?: number[];
    /** Per-attempt cap (ms). The AbortSignal cancels the query, so a stalled call
     *  can't hang the pre-ack path. */
    timeoutMs?: number;
    label?: string;
    sleep?: (ms: number) => Promise<void>;
  } = {}
): Promise<R> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const backoff = opts.backoffMs ?? [100, 250];
  const timeoutMs = opts.timeoutMs ?? 2000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  let last: R = { data: null, error: new Error("no attempts made") } as unknown as R;
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error("attempt timed out")), timeoutMs);
    try {
      const res = await fn(ctrl.signal);
      clearTimeout(timer);
      if (!res.error) return res; // delivered
      last = res;
    } catch (err) {
      // A supabase call normally resolves {data,error}; a genuine throw (network) or
      // an AbortError (our per-attempt timeout) lands here and is retried.
      clearTimeout(timer);
      last = { data: null, error: err } as unknown as R;
    }
    if (i < attempts - 1) await sleep(backoff[Math.min(i, backoff.length - 1)]);
  }
  if (opts.label) {
    console.error(`[retry] ${opts.label} failed after ${attempts} attempts`, last.error);
  }
  return last;
}
