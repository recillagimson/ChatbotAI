// lib/section-versions.ts
// Rules for the prompt-section version history (table chatbot_section_versions,
// written by a trigger on chatbots; see supabase/migrations/2026-09-28-section-versions.sql).
// Pure and client-safe.

import type { SectionColumn } from "./types";
import { ALL_SECTION_COLUMNS } from "./change-categories";

/** How much of each old version the history list ships; "View" fetches the rest. */
export const VERSION_PREVIEW_CHARS = 280;

/** How many versions the history list shows (the table keeps 50 per section). */
export const VERSION_LIST_LIMIT = 20;

export function isSectionColumn(v: unknown): v is SectionColumn {
  return typeof v === "string" && (ALL_SECTION_COLUMNS as string[]).includes(v);
}

/**
 * Who may put an old version back. Mirrors who may edit the section: the owner
 * edits Personality directly, so they may restore it; Offers and Rebuttals are
 * changed only by the SpeedSettr team (through reviewed requests), so restoring
 * them is the team's too.
 */
export function canRestoreSection(section: SectionColumn, isSuperadmin: boolean): boolean {
  return section === "persona_section" || isSuperadmin;
}

/**
 * Who made a change, from the viewer's side. A version with no writer was a
 * service-role write; for these sections that is the team's kb-sync script
 * (the app's own routes write with the caller's session), so it reads as the
 * team's change.
 */
export function versionAuthorLabel(
  changedBy: string | null,
  ctx: { viewerId: string; ownerId: string }
): string {
  if (changedBy && changedBy === ctx.viewerId) return "You";
  if (changedBy && changedBy === ctx.ownerId) return "The client";
  return "SpeedSettr team";
}
