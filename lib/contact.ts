// lib/contact.ts
// Helpers for displaying a conversation contact's name/handle.
//
// ManyChat sends first_name / last_name / username as merge fields. When those
// aren't wired (or for a test contact), ManyChat delivers the LITERAL template
// string, e.g. "{{first_name}}" / "{{ig_username}}", which then gets stored and
// rendered verbatim. Treat any unresolved "{{...}}" placeholder (and empties) as
// missing, and fall back name -> username -> a default. Pure + unit-testable.

/** An unresolved merge-field placeholder like "{{first_name}}". */
function isUnresolvedPlaceholder(v: string): boolean {
  return /\{\{.*?\}\}/.test(v);
}

/**
 * Normalize a raw contact field: trim it, and return null if it's empty or an
 * unresolved "{{...}}" placeholder. Real names never contain "{{}}", so this is
 * safe.
 */
export function cleanContactField(v?: string | null): string | null {
  const t = (v ?? "").trim();
  if (!t || isUnresolvedPlaceholder(t)) return null;
  return t;
}

/**
 * Best display name for a contact: their name, else their username, else a
 * default. Placeholder/empty values are skipped (see cleanContactField).
 */
export function contactDisplayName(
  name?: string | null,
  username?: string | null,
  fallback = "Unknown contact"
): string {
  return cleanContactField(name) ?? cleanContactField(username) ?? fallback;
}

/** The contact's @handle if it's a real value, else null. */
export function contactHandle(username?: string | null): string | null {
  return cleanContactField(username);
}
