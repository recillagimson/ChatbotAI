import type { ChangeCategory, SectionColumn } from "./types";

/**
 * Single source of truth for the Request Change categories.
 *
 * Three categories map to one editable prompt-section column on `chatbots`;
 * "other" has no section (it only adds knowledge-base entries); "overall" also
 * has no single column - the AI decides which of the three sections (and/or KB)
 * the request affects and edits each one (see ChangeProposal.sections).
 */
export const SECTION_BY_CATEGORY = {
  personality: "persona_section",
  offers: "offers_section",
  rebuttals: "rebuttals_section",
} as const satisfies Record<"personality" | "offers" | "rebuttals", SectionColumn>;

export type { SectionColumn };

/** Every section column an "overall" request may touch, in display order. */
export const ALL_SECTION_COLUMNS: SectionColumn[] = [
  "persona_section",
  "offers_section",
  "rebuttals_section",
];

/** Short human label for each section column (used in multi-section diffs). */
export const SECTION_LABELS: Record<SectionColumn, string> = {
  persona_section: "Personality / Tone",
  offers_section: "Offers & services / links",
  rebuttals_section: "Rebuttals & FAQs",
};

/** Human labels for the request-change categories (selectors + review UI). */
export const CATEGORY_LABELS: Record<ChangeCategory, string> = {
  personality: "Personality / Tone",
  offers: "Offers & services / inclusions & exclusions / links",
  rebuttals: "Rebuttals & FAQs",
  other: "Others (knowledge base & misc)",
  overall: "Overall (anything your request affects)",
};

/**
 * The single section column for a category, or null for categories with no one
 * column: "other" (KB-only) and "overall" (multi-section, see .sections).
 */
export function sectionColumnFor(category: ChangeCategory): SectionColumn | null {
  return category === "personality" || category === "offers" || category === "rebuttals"
    ? SECTION_BY_CATEGORY[category]
    : null;
}

/** True for the AI-routed multi-section category. */
export function isOverallCategory(category: ChangeCategory): category is "overall" {
  return category === "overall";
}

/**
 * Personality changes apply instantly (client, no admin). Offers, Rebuttals,
 * Others/KB and Overall require admin approval. This is the routing gate for the
 * whole feature.
 */
export function autoAppliesWithoutApproval(category: ChangeCategory): boolean {
  return category === "personality";
}
