/**
 * Lead contacts page (/leads): the follow-up status of a lead who sent a phone
 * number or email, and the rules for the remarks log. Pure, shared by the page,
 * the API route and the tests (tests/lead-status.spec.ts).
 */

export const LEAD_STATUSES = ["pending", "reached_out", "follow_up", "done"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  pending: "Pending",
  reached_out: "Reached out",
  follow_up: "Follow up",
  done: "Done",
};

export const MAX_REMARK_CHARS = 2000;

export function isLeadStatus(v: unknown): v is LeadStatus {
  return typeof v === "string" && (LEAD_STATUSES as readonly string[]).includes(v);
}

/** A stored status; null or anything unknown reads as pending (a new lead). */
export function leadStatusOf(v: unknown): LeadStatus {
  return isLeadStatus(v) ? v : "pending";
}

/** The ?status= filter: a known status, else "all". */
export function parseStatusFilter(v: unknown): LeadStatus | "all" {
  return isLeadStatus(v) ? v : "all";
}

/** Trimmed remark text, or null when empty or too long. */
export function cleanRemark(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t && t.length <= MAX_REMARK_CHARS ? t : null;
}

/** The log line written when someone changes a lead's status. */
export function statusChangeRemark(from: LeadStatus, to: LeadStatus): string {
  return `Status: ${LEAD_STATUS_LABEL[from]} → ${LEAD_STATUS_LABEL[to]}`;
}

/** How many leads sit in each status, plus the total. */
export function countByStatus(rows: { lead_status: unknown }[]): Record<LeadStatus | "all", number> {
  const out = { all: rows.length, pending: 0, reached_out: 0, follow_up: 0, done: 0 };
  for (const r of rows) out[leadStatusOf(r.lead_status)] += 1;
  return out;
}
