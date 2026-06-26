import type { ChangeCategory, Chatbot } from "./types";

/**
 * Single source of truth for the Request Change categories.
 *
 * Three of the four categories map to an editable prompt section column on
 * `chatbots`; "other" has no section (it only adds knowledge-base entries).
 */
export const SECTION_BY_CATEGORY = {
  personality: "persona_section",
  offers: "offers_section",
  rebuttals: "rebuttals_section",
} as const satisfies Record<Exclude<ChangeCategory, "other">, keyof Chatbot>;

export type SectionColumn = (typeof SECTION_BY_CATEGORY)[keyof typeof SECTION_BY_CATEGORY];

/** Human labels for the 4 request-change categories (selectors + review UI). */
export const CATEGORY_LABELS: Record<ChangeCategory, string> = {
  personality: "Personality / Tone",
  offers: "Offers & services / inclusions & exclusions / links",
  rebuttals: "Rebuttals & FAQs",
  other: "Others (knowledge base & misc)",
};

/** The section column for a category, or null for "other" (KB-only). */
export function sectionColumnFor(category: ChangeCategory): SectionColumn | null {
  return category === "other" ? null : SECTION_BY_CATEGORY[category];
}

/**
 * Personality changes apply instantly (client, no admin). Offers, Rebuttals and
 * Others/KB require admin approval. This is the routing gate for the whole feature.
 */
export function autoAppliesWithoutApproval(category: ChangeCategory): boolean {
  return category === "personality";
}
