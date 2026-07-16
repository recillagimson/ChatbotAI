/**
 * Openers that always count as a bare greeting, in NORMALIZED form (see
 * normalizeOpener: lowercased, all non-alphanumerics stripped). Matched by exact
 * equality, so "Hey there!" -> "heythere" is covered, but "hey my score is 649"
 * ("heymyscoreis649") is not — extra content beyond the greeting reads as substantive.
 */
export const GREETING_OPENERS: string[] = [
  "hi", "hii", "hiii", "hey", "heyy", "heyyy", "heya", "hiya",
  "yo", "yoo", "yooo", "hello", "helo", "hellothere",
  "sup", "wsg", "wassup", "whatsup", "whatsgood",
  "goodmorning", "gm", "goodafternoon", "goodevening",
  "howdy", "hola", "gday", "heythere",
];

/** Lowercase + strip everything but a-z0-9 (emoji, punctuation, spaces). */
export function normalizeOpener(text: string): string {
  return (text ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Coerce a jsonb welcome_keywords value (unknown) into a clean string[]. */
export function coerceKeywords(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((k): k is string => typeof k === "string" && k.trim().length > 0);
}

/**
 * True iff the WHOLE message, normalized, exactly equals a built-in greeting or one
 * of the chatbot's configured opener keywords (also normalized). Extra words beyond
 * the greeting/keyword -> false (treated as substantive → the AI answers it).
 */
export function isWelcomeOpener(text: string, keywords: string[]): boolean {
  const norm = normalizeOpener(text);
  if (!norm) return false;
  if (GREETING_OPENERS.includes(norm)) return true;
  return keywords.some((k) => normalizeOpener(k) === norm);
}

export interface WelcomeInput {
  welcomedAt: string | null;
  entryPoint: string | null; // body.entry_point ("comment" = comment-campaign opt-in)
  hasMedia: boolean;
  text: string; // baseText (media URLs already stripped)
  chatbot: {
    welcome_enabled: boolean;
    welcome_flow_ns: string | null;
    welcome_keywords: string[];
  };
}

/**
 * Decide whether to fire the Welcome VM flow for this inbound. Pure — the webhook
 * does the claim + flow trigger. Rule order (rules-first, no AI):
 *   1. not configured (disabled / no flow) -> false
 *   2. already resolved (welcomedAt set)   -> false
 *   3. comment-campaign opt-in             -> true  (the comment keyword IS the opener)
 *   4. any inbound media                   -> false (substantive -> AI)
 *   5. else: message is exactly a greeting/keyword?
 */
export function shouldSendWelcome(input: WelcomeInput): boolean {
  const { chatbot } = input;
  if (!chatbot.welcome_enabled || !chatbot.welcome_flow_ns) return false;
  if (input.welcomedAt) return false;
  if (input.entryPoint === "comment") return true;
  if (input.hasMedia) return false;
  return isWelcomeOpener(input.text, chatbot.welcome_keywords);
}
