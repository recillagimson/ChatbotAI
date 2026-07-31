/**
 * Follow-up sequence reach - how far down the drip each thread actually got.
 *
 * A chatbot has two ordered sequences: `auto_followup_steps` runs while the lead
 * has not been sent a link, and `auto_followup_link_steps` takes over once
 * `conversations.link_sent_at` is set (see lib/followup.ts `resolveLinkSteps`).
 * `followup_step_index` is the NEXT step the cron would send, so a thread sitting
 * at index k has already received k of them.
 *
 * What this can and cannot say, stated plainly because the card is built on it:
 *
 *  - REACH is real. "How many threads got step 3" is exactly what the index
 *    encodes, so the drop-off down a sequence is measured, not estimated.
 *  - REPLY ATTRIBUTION is not. Nothing records which follow-up a lead answered:
 *    there is one `last_followup_at`, not a row per send, so "step 2 produced 8
 *    replies" cannot be derived from this schema. The design shows sent→replied
 *    per step; we show reach only and say so on the card rather than dividing two
 *    numbers that were never linked.
 *
 * One known wrinkle, deliberately not papered over: the link trigger sets
 * `link_sent_at` without resetting `followup_step_index`, so a thread that had
 * already taken two pre-link steps enters the link sequence at index 2. Its reach
 * is therefore counted against the link sequence from step 3. That is what the
 * cron will actually do next, so it is the honest reading of the column.
 *
 * Pure functions - no client, no clock.
 */

/** The shape `auto_followup_steps` / `auto_followup_link_steps` rows arrive in. */
export interface SequenceStepConfig {
  delay_hours?: number | null;
  text?: string | null;
  ai_generate?: boolean | null;
}

/** The columns this module needs off a chatbot row. */
export interface SequenceBot {
  id: string;
  auto_followup_enabled?: boolean | null;
  auto_followup_steps?: unknown;
  auto_followup_link_steps?: unknown;
}

/** The columns this module needs off a conversation row. */
export interface SequenceConversation {
  chatbot_id: string;
  followup_step_index?: number | null;
  link_sent_at?: string | null;
}

export interface SequenceStep {
  /** 1-based step number as the owner sees it in the editor. */
  step: number;
  /** Threads that received this step. */
  reached: number;
  /** Share of the threads that received step 1, 0-100. Null when step 1 is 0. */
  shareOfFirst: number | null;
  /** True when no thread has ever reached this step in the period. */
  dead: boolean;
}

export interface SequenceStats {
  /** Configured length of the sequence. 0 when it isn't set up. */
  length: number;
  steps: SequenceStep[];
  /** Threads that entered the sequence at all (received step 1). */
  entered: number;
}

export interface SequenceReport {
  preLink: SequenceStats;
  postLink: SequenceStats;
  /** True when at least one in-scope chatbot has the drip switched on. */
  enabled: boolean;
  /** True when more than one chatbot is in scope, so step N is not one message. */
  mixed: boolean;
}

/** Count the configured steps in a JSONB column, tolerating null/garbage. */
export function stepCount(raw: unknown): number {
  return Array.isArray(raw) ? raw.length : 0;
}

/**
 * Build the reach table for one sequence.
 *
 * `lengths` is per chatbot, because two bots can have different sequence
 * lengths; the table runs to the longest of them and each thread is only ever
 * counted against its own bot's steps.
 */
function statsFor(
  rows: SequenceConversation[],
  lengths: Map<string, number>
): SequenceStats {
  const length = Math.max(0, ...lengths.values());
  if (!length) return { length: 0, steps: [], entered: 0 };

  const reached = new Array<number>(length).fill(0);
  for (const r of rows) {
    const botLength = lengths.get(r.chatbot_id) ?? 0;
    if (!botLength) continue;
    // Index is the NEXT step to send, so it equals the number already received.
    const got = Math.max(0, Math.min(botLength, r.followup_step_index ?? 0));
    for (let i = 0; i < got; i++) reached[i] += 1;
  }

  const first = reached[0] ?? 0;
  return {
    length,
    entered: first,
    steps: reached.map((n, i) => ({
      step: i + 1,
      reached: n,
      shareOfFirst: first > 0 ? (n / first) * 100 : null,
      dead: n === 0,
    })),
  };
}

/**
 * Split the in-scope threads by which sequence they're in and measure both.
 *
 * A thread with a link sent is in the post-link sequence and only there - it is
 * never double-counted, which is why the two columns can be read side by side.
 */
export function buildSequenceReport(
  bots: SequenceBot[],
  conversations: SequenceConversation[]
): SequenceReport {
  const preLengths = new Map<string, number>();
  const postLengths = new Map<string, number>();
  for (const b of bots) {
    preLengths.set(b.id, stepCount(b.auto_followup_steps));
    postLengths.set(b.id, stepCount(b.auto_followup_link_steps));
  }

  const pre: SequenceConversation[] = [];
  const post: SequenceConversation[] = [];
  for (const c of conversations) {
    (c.link_sent_at ? post : pre).push(c);
  }

  return {
    preLink: statsFor(pre, preLengths),
    postLink: statsFor(post, postLengths),
    enabled: bots.some((b) => b.auto_followup_enabled === true),
    mixed: bots.length > 1,
  };
}

/**
 * The sentence the card is for: where the sequence stops earning its sends.
 *
 * Returns null when there's nothing worth saying - an unconfigured sequence, or
 * one where every step still reaches someone. Silence beats a manufactured
 * insight; the owner only needs a line here when there's a step to cut.
 */
export function sequenceInsight(report: SequenceReport): string | null {
  const parts: string[] = [];
  for (const [name, s] of [
    ["Pre-link", report.preLink],
    ["Post-link", report.postLink],
  ] as const) {
    if (!s.length || !s.entered) continue;
    // The first step nobody reaches - everything from there on is unused.
    const firstDead = s.steps.find((st) => st.dead);
    if (firstDead && firstDead.step <= s.length) {
      const unused = s.length - firstDead.step + 1;
      parts.push(
        `${name} step${unused === 1 ? "" : "s"} ${firstDead.step}${
          unused === 1 ? "" : `–${s.length}`
        } reached nobody`
      );
    }
  }
  if (!parts.length) return null;
  return `${parts.join(", and ")}. A step no thread reaches costs nothing to send, but it also can't be the reason anyone replied - trim the sequence to what's actually running before judging it.`;
}
