import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { canRestoreSection, versionAuthorLabel, VERSION_PREVIEW_CHARS } from "@/lib/section-versions";

/**
 * Version history for the three prompt sections. The database records the text
 * a section had BEFORE every change, whoever made it (the Prompt tab, Request
 * Changes, the team, or a script like kb-sync), so any change can be undone.
 */

const ROOT = path.resolve(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
const MIGRATION = "supabase/migrations/2026-09-28-section-versions.sql";
/** SQL without comments, so the explanation can't satisfy an assertion. */
const sql = () => read(MIGRATION).replace(/--.*$/gm, "");

describe("the migration", () => {
  it("exists", () => {
    expect(existsSync(path.join(ROOT, MIGRATION))).toBe(true);
  });

  it("creates the table with row level security on", () => {
    const s = sql();
    expect(s).toMatch(/create table if not exists public\.chatbot_section_versions/i);
    expect(s).toMatch(/references public\.chatbots\(id\) on delete cascade/i);
    expect(s).toMatch(/alter table public\.chatbot_section_versions enable row level security/i);
  });

  it("lets the bot's CURRENT owner read (through chatbots, so history follows a transfer)", () => {
    expect(sql()).toMatch(
      /for select[\s\S]*?using\s*\(\s*exists\s*\(\s*select 1 from public\.chatbots c\s+where c\.id = chatbot_id and c\.user_id = auth\.uid\(\)/i
    );
  });

  it("lets a superadmin read", () => {
    expect(sql()).toMatch(/for select[\s\S]*?using\s*\(\s*public\.is_superadmin\(\)\s*\)/i);
  });

  it("gives clients no way to write history themselves", () => {
    const s = sql();
    expect(s).not.toMatch(/for (insert|update|delete|all)/i);
    expect(s).toMatch(/revoke insert, update, delete on public\.chatbot_section_versions from anon, authenticated/i);
    // Supabase's defaults also grant TRUNCATE (not subject to RLS), REFERENCES,
    // TRIGGER and anon SELECT; none is ever needed.
    expect(s).toMatch(/revoke truncate, references, trigger on public\.chatbot_section_versions from anon, authenticated/i);
    expect(s).toMatch(/revoke select on public\.chatbot_section_versions from anon/i);
  });

  it("records the OLD text from a security-definer trigger with a pinned search_path", () => {
    const s = sql();
    expect(s).toMatch(/security definer/i);
    expect(s).toMatch(/set search_path = public/i);
    for (const col of ["persona_section", "offers_section", "rebuttals_section"]) {
      expect(s).toMatch(new RegExp(`new\\.${col} is distinct from old\\.${col}`, "i"));
      expect(s).toMatch(new RegExp(`'${col}', old\\.${col}, auth\\.uid\\(\\)`, "i"));
    }
  });

  it("fires only on updates of the three section columns", () => {
    expect(sql()).toMatch(
      /after update of persona_section, offers_section, rebuttals_section on public\.chatbots/i
    );
  });

  it("keeps a bounded history per section", () => {
    expect(sql()).toMatch(/row_number\(\) over \(partition by section order by created_at desc, id desc\)/i);
    expect(sql()).toMatch(/rn > 50/);
  });
});

describe("canRestoreSection", () => {
  it("lets the owner restore Personality, which they can edit anyway", () => {
    expect(canRestoreSection("persona_section", false)).toBe(true);
  });

  it("keeps Offers and Rebuttals team-only, like editing them", () => {
    expect(canRestoreSection("offers_section", false)).toBe(false);
    expect(canRestoreSection("rebuttals_section", false)).toBe(false);
    expect(canRestoreSection("offers_section", true)).toBe(true);
  });
});

describe("versionAuthorLabel", () => {
  it("names who made the change, from the viewer's side", () => {
    expect(versionAuthorLabel("u1", { viewerId: "u1", ownerId: "u1" })).toBe("You");
    expect(versionAuthorLabel("owner", { viewerId: "admin", ownerId: "owner" })).toBe("The client");
    expect(versionAuthorLabel("admin", { viewerId: "owner", ownerId: "owner" })).toBe("SpeedSettr team");
    // No signed-in writer = a service-role write. For these sections that is the
    // team's kb-sync script (server routes write with the caller's session), so
    // the client sees it as the team's change.
    expect(versionAuthorLabel(null, { viewerId: "owner", ownerId: "owner" })).toBe("SpeedSettr team");
  });
});

describe("the history routes", () => {
  const list = "app/api/chatbots/[id]/section-versions/route.ts";
  const one = "app/api/chatbots/[id]/section-versions/[versionId]/route.ts";
  const restore = "app/api/chatbots/[id]/section-versions/[versionId]/restore/route.ts";

  it("the list ships short previews, never whole texts", () => {
    const src = code(list);
    expect(src).toMatch(/\.slice\(0,\s*VERSION_PREVIEW_CHARS\)/);
    expect(src).toMatch(/\.limit\(/);
    expect(VERSION_PREVIEW_CHARS).toBeLessThanOrEqual(400);
  });

  it("every route authorizes the bot through resolveChatbotAccess + ownerScope", () => {
    for (const rel of [list, one, restore]) {
      const src = code(rel);
      expect(src, rel).toMatch(/resolveChatbotAccess\(\)/);
      expect(src, rel).toMatch(/ownerScope\(/);
    }
  });

  it("restore checks the section permission and compare-and-sets on updated_at", () => {
    const src = code(restore);
    expect(src).toMatch(/canRestoreSection\(/);
    expect(src).toMatch(/requireSuperadmin\(\)/);
    expect(src).toMatch(/\.eq\("updated_at",/);
    expect(src).toMatch(/\.eq\("chatbot_id", id\)/);
  });

  it("a missing table reads as 'not switched on yet', not a crash", () => {
    expect(code(list)).toMatch(/42P01/);
  });
});
