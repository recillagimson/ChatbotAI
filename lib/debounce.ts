/**
 * Reply debounce + burst consolidation (pure logic; the webhook wires it up).
 *
 * When a lead sends several messages in quick succession, each webhook run
 * persists its message, claims the conversation (overwriting any older claim
 * on conversations.reply_claimed_for), then sleeps out the debounce window.
 * On waking, only the run whose claim survived answers — and it answers the
 * whole unanswered burst in ONE consolidated reply. The claim/release
 * choreography lives in app/api/webhooks/manychat/route.ts; the decision
 * logic here is pure and covered by scripts/test-debounce.ts.
 */

/** Quiet period before the bot answers, so rapid bursts get one reply.
 *  0 disables the wait but keeps single-flight consolidation active. */
export const REPLY_DEBOUNCE_MS = Number(process.env.REPLY_DEBOUNCE_MS ?? 5_000);

export interface BurstRow {
  id: string;
  role: string;
  content: string;
}

/** ms still to sleep so the total wait since request start ≈ debounceMs.
 *  Media download/transcription time already elapsed counts toward the wait. */
export function remainingDebounceMs(
  elapsedMs: number,
  debounceMs: number = REPLY_DEBOUNCE_MS
): number {
  if (!Number.isFinite(debounceMs) || debounceMs <= 0) return 0;
  return Math.max(0, Math.round(debounceMs - Math.max(0, elapsedMs)));
}

/**
 * Split a created_at-DESC message window into the unanswered burst and prior
 * history. burst = the leading run of role==='user' rows (every user message
 * since the last assistant/human_agent reply — including rows whose own run
 * never generated, e.g. rate-limited ones); prior = everything older. Both
 * are returned in CHRONOLOGICAL order. An empty burst means someone (human
 * agent or a canned path) already answered during the debounce sleep.
 */
export function splitBurst<T extends BurstRow>(rowsDesc: T[]): { burst: T[]; prior: T[] } {
  let i = 0;
  while (i < rowsDesc.length && rowsDesc[i].role === "user") i++;
  return {
    burst: rowsDesc.slice(0, i).reverse(),
    prior: rowsDesc.slice(i).reverse(),
  };
}

/**
 * Join a burst into one effective user message, one message per line. The row
 * whose id === currentId uses currentEffective (the in-memory composeUserMessage
 * output — fresher than the DB row if this run's media backfill failed); other
 * rows use their stored content (backfilled with transcripts/doc text by their
 * own runs, or the provisional attachment label if that backfill is still in
 * flight). Consecutive identical lines collapse so a triple-tap of "yes" reads
 * as a single "yes".
 */
export function combineBurstText(
  burst: BurstRow[],
  currentId: string | undefined,
  currentEffective: string
): string {
  if (!burst.length) return currentEffective;
  const lines: string[] = [];
  for (const row of burst) {
    const text = (row.id === currentId ? currentEffective : row.content).trim();
    if (!text) continue;
    if (lines.length && lines[lines.length - 1] === text) continue; // collapse consecutive dupes
    lines.push(text);
  }
  return lines.length ? lines.join("\n") : currentEffective;
}
