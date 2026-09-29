// lib/follow-setup-cookie.ts
// The Statistics "Track new Instagram followers" prompt's Hide, remembered per
// browser AND per account. The cookie holds the ids of the accounts whose prompt
// this browser hides, so a superadmin who hides it while viewing one client (View
// as client) doesn't hide it for every other account they open. No imports on
// purpose: the client Hide button and the server Statistics page both use it.

export const FOLLOW_SETUP_HIDDEN_COOKIE = "ss_hide_follow_setup";

/** How many accounts one browser remembers, so the cookie stays small. */
export const FOLLOW_SETUP_HIDDEN_MAX = 20;

/** One year, in seconds. */
export const FOLLOW_SETUP_HIDDEN_MAX_AGE = 31_536_000;

// "." separates ids: a comma is not a valid cookie-value character, and account
// ids (uuids) never contain a dot.
const SEPARATOR = ".";

const parse = (value: string | null | undefined): string[] =>
  (value ?? "")
    .split(SEPARATOR)
    .map((s) => s.trim())
    .filter(Boolean);

/** True when this browser hid the prompt for `accountId` (the account being viewed). */
export function followSetupHiddenFor(
  value: string | null | undefined,
  accountId: string | null | undefined
): boolean {
  return !!accountId && parse(value).includes(accountId);
}

/** The cookie value after hiding the prompt for `accountId`: newest last, at most FOLLOW_SETUP_HIDDEN_MAX ids. */
export function withFollowSetupHidden(value: string | null | undefined, accountId: string): string {
  const ids = parse(value).filter((id) => id !== accountId);
  ids.push(accountId);
  return ids.slice(-FOLLOW_SETUP_HIDDEN_MAX).join(SEPARATOR);
}

/** This cookie's value out of a `document.cookie` string. */
export function readFollowSetupHidden(cookieHeader: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const at = part.indexOf("=");
    if (at > -1 && part.slice(0, at).trim() === FOLLOW_SETUP_HIDDEN_COOKIE) return part.slice(at + 1).trim();
  }
  return null;
}

/** The full `document.cookie` assignment that remembers `value` for a year, site-wide. */
export function followSetupHiddenCookie(value: string, secure: boolean): string {
  return `${FOLLOW_SETUP_HIDDEN_COOKIE}=${value}; path=/; max-age=${FOLLOW_SETUP_HIDDEN_MAX_AGE}; samesite=lax${secure ? "; secure" : ""}`;
}
