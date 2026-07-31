/**
 * Reply debounce + burst consolidation (pure logic; the webhook wires it up).
 *
 * When a lead sends several messages in quick succession, each webhook run
 * persists its message, claims the conversation (overwriting any older claim
 * on conversations.reply_claimed_for), then sleeps out the debounce window.
 * On waking, only the run whose claim survived answers - and it answers the
 * whole unanswered burst in ONE consolidated reply. The claim/release
 * choreography lives in app/api/webhooks/manychat/route.ts; the decision
 * logic here is pure and covered by scripts/test-debounce.ts.
 */

/** FALLBACK quiet period before the bot answers, so rapid bursts get one reply.
 *  Used only when a chatbot has no per-bot window (missing column, pre-migration).
 *  0 disables the wait but keeps single-flight consolidation active. Per-chatbot
 *  overrides come from chatbots.reply_debounce_seconds (see clampDebounceSeconds). */
export const REPLY_DEBOUNCE_MS = Number(process.env.REPLY_DEBOUNCE_MS ?? 5_000);

/** Bounds for the per-chatbot reply-wait (seconds). The webhook sleeps this long
 *  inside the fast-ack background function, so the ceiling stays well under the
 *  Vercel maxDuration (300s Pro) with room left for generation + bubble pacing. */
export const MIN_DEBOUNCE_SECONDS = 0;
export const MAX_DEBOUNCE_SECONDS = 120;

/** Clamp a per-chatbot reply-wait (seconds) into the safe range and floor to a
 *  whole second. Non-finite (NaN / null / undefined) → MIN (0). NOTE: a MISSING
 *  column should fall back to REPLY_DEBOUNCE_MS at the call site - this clamps a
 *  value that is actually present, it does not decide the fallback. */
export function clampDebounceSeconds(seconds: number | null | undefined): number {
  const n = Number(seconds);
  if (!Number.isFinite(n)) return MIN_DEBOUNCE_SECONDS;
  return Math.min(MAX_DEBOUNCE_SECONDS, Math.max(MIN_DEBOUNCE_SECONDS, Math.floor(n)));
}

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
 * since the last assistant/human_agent reply - including rows whose own run
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
 * output - fresher than the DB row if this run's media backfill failed); other
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

/**
 * Should an in-flight reply run ABANDON its answer? True if, since this run
 * started, the owner took over (status 'ai_paused') or the lead self-muted
 * (user_muted_at set). A null/undefined row (transient fetch error) → false:
 * fail-open, never drop a legitimate reply on a blip. Used both by the burst
 * post-debounce guard and the final pre-push re-check (which runs in ALL modes,
 * so single/response-channel runs also honor a mute set during generation).
 */
export function shouldStandDown(
  fresh: { status?: string | null; user_muted_at?: string | null } | null | undefined
): boolean {
  return !!fresh && (fresh.status === "ai_paused" || !!fresh.user_muted_at);
}
