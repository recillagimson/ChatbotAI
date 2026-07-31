/**
 * Display formatters for the dashboard. Pure and shared so the same number never
 * appears two ways on two screens.
 */

/** 41 → "41s"; 96 → "1m 36s"; 3720 → "1h 2m"; null → "-". */
export function formatSecs(secs: number | null | undefined): string {
  if (secs == null || !Number.isFinite(secs)) return "-";
  const s = Math.max(0, Math.round(secs));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) {
    const rem = s % 60;
    return rem ? `${m}m ${rem}s` : `${m}m`;
  }
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM ? `${h}h ${remM}m` : `${h}h`;
}

/** The seconds value split for the hero, where the unit is set smaller. */
export function splitDuration(
  secs: number | null | undefined
): { value: string; unit: string } | null {
  if (secs == null || !Number.isFinite(secs)) return null;
  const s = Math.max(0, Math.round(secs));
  if (s < 60) return { value: String(s), unit: "s" };
  const m = Math.floor(s / 60);
  if (m < 60) return { value: String(m), unit: "m" };
  return { value: String(Math.floor(m / 60)), unit: "h" };
}

/** 1899 → "1,899". Nulls read as an em-dash, never "0". */
export function num(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "-";
  return n.toLocaleString("en-US");
}

/** 0.982 → "98.2%". `digits` defaults to one decimal, dropped when it's .0. */
export function pct(
  value: number | null | undefined,
  digits = 1
): string {
  if (value == null || !Number.isFinite(value)) return "-";
  const s = value.toFixed(digits);
  return `${s.endsWith(".0") ? s.slice(0, -2) : s}%`;
}

/** Percentage change from `before` to `after`, or null when there's no base. */
export function change(after: number, before: number): number | null {
  if (!before) return null;
  return ((after - before) / before) * 100;
}

/** 997 → "$997"; 10764 → "$10,764". */
export function money(n: number, withCents = false): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: withCents ? 2 : 0,
    maximumFractionDigits: withCents ? 2 : 0,
  });
}

/** "Wednesday, 30 July" - the Overview header's date line. */
export function longDate(d: Date = new Date()): string {
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** "Jul 24, 2026" - invoice and history rows. */
export function shortDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "9:12 PM" - inbox timestamps within the day. */
export function clockTime(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Inbox-style stamp: the time for today, a weekday inside the last week, a
 * date beyond that. Keeps the list column narrow without losing recency.
 */
export function inboxStamp(d: string | Date, now: Date = new Date()): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return clockTime(date);
  const days = (now.getTime() - date.getTime()) / 86_400_000;
  if (days < 7) return date.toLocaleDateString("en-US", { weekday: "short" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "23m ago", "2h ago", "6d ago" - used beside a lead who is waiting. */
export function agoShort(d: string | Date, now: number = Date.now()): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const ms = now - date.getTime();
  if (!Number.isFinite(ms)) return "";
  const mins = Math.max(0, Math.floor(ms / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** "07/14" - sparkline axis ticks. */
export function tickDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" });
}
