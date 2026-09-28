// lib/change-final.ts
// The two decisions behind the team's Approve and Publish of a change request,
// kept pure so they can be tested directly.
//
//  buildChangeFinal - what Approve stores. The team may edit the proposed text
//    before approving. If they approved it as proposed, the proposal's targeted
//    edits come along so Publish can re-apply them on newer text; if they rewrote
//    it, only the base fingerprint comes along (a hand-edited text can be checked
//    against the live section, not re-applied to it).
//
//  planPublish - what Publish writes, given the LIVE sections. Every section is
//    run through rebaseOnLive (lib/section-edits.ts): unchanged since drafting ->
//    the approved text; changed -> the edits re-applied on top; otherwise a
//    conflict. Any conflict blocks the whole publish, so an "overall" request
//    never goes live half-applied.

import type { ChangeCategory, ChangeFinal, ChangeProposal, SectionColumn, SectionEdit, TextEdit } from "./types";
import { sectionColumnFor, SECTION_LABELS } from "./change-categories";
import { rebaseOnLive } from "./section-edits";

export function buildChangeFinal(input: {
  category: ChangeCategory;
  proposed: ChangeProposal | null;
  section_content?: string;
  sections?: { section: SectionColumn; section_content: string }[];
  system_prompt?: string;
  kb_entries?: { title: string; content: string }[];
}): ChangeFinal {
  const { proposed } = input;
  const final: ChangeFinal = {};

  const sectionCol = sectionColumnFor(input.category);
  const sc = input.section_content?.trim();
  if (sectionCol && sc) {
    final.section = sectionCol;
    final.section_content = sc;
    if (proposed?.base_hash) final.base_hash = proposed.base_hash;
    const asProposed = proposed?.section_content?.trim() === sc;
    if (asProposed && proposed?.edits?.length) final.edits = proposed.edits;
    if (asProposed && proposed?.append) final.append = proposed.append;
  }

  // "overall": each affected section, trimmed + deduped (first entry per section wins).
  const seen = new Set<string>();
  const sections: SectionEdit[] = [];
  for (const s of input.sections ?? []) {
    const content = s.section_content.trim();
    if (!content || seen.has(s.section)) continue;
    seen.add(s.section);
    const p = proposed?.sections?.find((x) => x.section === s.section);
    const asProposed = !!p && p.section_content.trim() === content;
    sections.push({
      section: s.section,
      section_content: content,
      ...(p?.base_hash ? { base_hash: p.base_hash } : {}),
      ...(asProposed && p?.edits?.length ? { edits: p.edits } : {}),
      ...(asProposed && p?.append ? { append: p.append } : {}),
    });
  }
  if (sections.length) final.sections = sections;

  const sp = input.system_prompt?.trim();
  if (sp) final.system_prompt = sp;

  if (input.kb_entries?.length) {
    final.kb_entries = input.kb_entries.map((e) => ({ title: e.title.trim(), content: e.content.trim() }));
  }
  return final;
}

/** The live text of every column a publish can write. */
export interface LiveSections {
  persona_section: string | null;
  offers_section: string | null;
  rebuttals_section: string | null;
  system_prompt: string | null;
}

export function planPublish(
  category: ChangeCategory,
  final: ChangeFinal,
  live: LiveSections
):
  | { ok: true; patch: Record<string, string>; rebased: SectionColumn[] }
  | { ok: false; conflicts: string[] } {
  const patch: Record<string, string> = {};
  const rebased: SectionColumn[] = [];
  const conflicts: string[] = [];

  const plan = (
    col: SectionColumn,
    f: { section_content: string; base_hash?: string; edits?: TextEdit[]; append?: string }
  ) => {
    const text = f.section_content.trim();
    if (!text) return;
    const r = rebaseOnLive(live[col] ?? "", {
      base_hash: f.base_hash,
      edits: f.edits,
      append: f.append,
      text,
    });
    if (!r.ok) {
      conflicts.push(`${SECTION_LABELS[col]}: ${r.reason}`);
      return;
    }
    patch[col] = r.text;
    if (r.rebased) rebased.push(col);
  };

  // "overall" writes each affected section; single-section categories write their
  // one column; legacy requests (old shape, no section) publish into system_prompt.
  const publishCol = sectionColumnFor(category);
  if (final.sections && final.sections.length) {
    for (const s of final.sections) plan(s.section, s);
  } else if (publishCol && final.section_content?.trim()) {
    plan(publishCol, {
      section_content: final.section_content,
      base_hash: final.base_hash,
      edits: final.edits,
      append: final.append,
    });
  } else if (final.system_prompt?.trim()) {
    patch.system_prompt = final.system_prompt.trim();
  }

  return conflicts.length ? { ok: false, conflicts } : { ok: true, patch, rebased };
}
