/**
 * Password strength, scored 0-4 for the four-bar meter on the signup form.
 *
 * Pure and deliberately simple: this is a *hint* to the person typing, not a
 * gate. The only hard requirement enforced by the form is the 8-character
 * minimum, which is also what Supabase rejects below.
 *
 * The rules are additive and each maps to one bar, so the meter's advice can
 * always be phrased as "do one more thing":
 *   1. at least 8 characters
 *   2. contains a number
 *   3. mixes upper and lower case (or is long enough that it doesn't matter)
 *   4. contains a symbol
 */

export const MIN_PASSWORD_LENGTH = 8;

/** A long passphrase earns the case bar without needing a capital letter. */
const LONG_ENOUGH = 14;

export interface PasswordScore {
  /** 0-4, one per filled bar. */
  score: number;
  /** Short label beside the meter. */
  label: string;
  /** The single most useful next improvement, or null when maxed out. */
  advice: string | null;
  /** True once the form will accept it. */
  acceptable: boolean;
}

export function scorePassword(password: string): PasswordScore {
  if (!password) {
    return { score: 0, label: "", advice: null, acceptable: false };
  }

  const longEnough = password.length >= MIN_PASSWORD_LENGTH;
  const hasNumber = /\d/.test(password);
  const mixedCase =
    (/[a-z]/.test(password) && /[A-Z]/.test(password)) ||
    password.length >= LONG_ENOUGH;
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  const score =
    Number(longEnough) + Number(hasNumber) + Number(mixedCase) + Number(hasSymbol);

  // Report the first unmet rule, so the advice never asks for two things at once.
  const advice = !longEnough
    ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
    : !hasNumber
      ? "Add a number."
      : !mixedCase
        ? "Mix upper and lower case."
        : !hasSymbol
          ? "Add a symbol for the fourth bar."
          : null;

  const label = !longEnough
    ? "Too short"
    : score <= 1
      ? "Weak"
      : score === 2
        ? "Fair"
        : score === 3
          ? "Strong"
          : "Very strong";

  return { score, label, advice, acceptable: longEnough };
}
