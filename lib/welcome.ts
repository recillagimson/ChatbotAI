/**
 * Openers that always count as a bare greeting, in NORMALIZED form (see
 * normalizeOpener: lowercased, all non-alphanumerics stripped). Matched by exact
 * equality, so "Hey there!" -> "heythere" is covered, but "hey my score is 649"
 * ("heymyscoreis649") is not - extra content beyond the greeting reads as substantive.
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
  // Did this opener match one of the chatbot's Keywords-tab triggers? The webhook
  // already computes this (firstMatchingGroup) for the keyword gate; passing it in lets
  // the welcome reuse the EXACT same match when welcome_use_keyword_triggers is on.
  keywordMatched: boolean;
  chatbot: {
    welcome_enabled: boolean;
    welcome_flow_ns: string | null;
    welcome_keywords: string[];
    welcome_use_keyword_triggers: boolean;
    // ON = every first message gets the welcome. An opener (rules 3, 5, 6) still gets
    // the welcome alone; anything else gets the welcome AND an AI answer.
    welcome_always?: boolean;
  };
}

/**
 * What the webhook does with a first message:
 *   "none"              -> no welcome, the AI answers as usual
 *   "welcome_only"      -> the welcome replaces the AI reply (a bare opener)
 *   "welcome_and_answer"-> the welcome goes out AND the AI answers the message
 *                          (welcome_always on, and the message says something)
 */
export type WelcomeAction = "none" | "welcome_only" | "welcome_and_answer";

/**
 * Decide whether to fire the Welcome VM flow for this inbound. Pure - the webhook
 * does the claim + flow trigger. Rule order (rules-first, no AI):
 *   1. not configured (disabled / no flow) -> false
 *   2. already resolved (welcomedAt set)   -> false
 *   3. comment-campaign opt-in             -> true  (the comment keyword IS the opener)
 *   4. any inbound media                   -> false (substantive -> AI)
 *   5. message is exactly a greeting / welcome_keyword       -> true
 *   6. (opt-in) message matched a Keywords-tab trigger, when
 *      welcome_use_keyword_triggers is on                    -> true
 *   7. welcome_always on (anything else, media included)     -> true, and the AI
 *      answers the message too (welcomeAction "welcome_and_answer")
 */
export function welcomeAction(input: WelcomeInput): WelcomeAction {
  const { chatbot } = input;
  if (!chatbot.welcome_enabled || !chatbot.welcome_flow_ns) return "none";
  if (input.welcomedAt) return "none";
  if (input.entryPoint === "comment") return "welcome_only";
  if (!input.hasMedia) {
    if (isWelcomeOpener(input.text, chatbot.welcome_keywords)) return "welcome_only";
    // Sync with the Keywords tab: treat a keyword-trigger match as a welcome opener too,
    // so the owner maintains one keyword list instead of a separate welcome list.
    if (chatbot.welcome_use_keyword_triggers && input.keywordMatched) return "welcome_only";
  }
  // A substantive opener (a question, detail, or media): welcome it too when the bot
  // welcomes everyone, but the AI still has to answer what they said.
  if (chatbot.welcome_always) return "welcome_and_answer";
  return "none";
}

export function shouldSendWelcome(input: WelcomeInput): boolean {
  return welcomeAction(input) !== "none";
}
