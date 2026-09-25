import ts from "typescript";
import { describe, expect, it } from "vitest";
import { callArgs, code } from "./helpers/source";

/**
 * A query-only change never re-shows a route's loading.tsx, so pages whose
 * controls only rewrite the query string key their own Suspense boundary. That
 * only works if the default export renders the boundary BEFORE any read: a
 * fetch left in the shell runs outside the boundary, and the old view stays up
 * for its whole duration.
 */
function defaultExportBody(rel: string): string {
  const src = code(rel);
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  for (const s of sf.statements) {
    if (
      ts.isFunctionDeclaration(s) &&
      s.body &&
      s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
      s.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
    ) {
      return s.body.getText(sf);
    }
  }
  throw new Error(`${rel}: no default-exported function declaration`);
}

/** The body of a top-level function declaration, by name. */
function functionBody(rel: string, name: string): string {
  const src = code(rel);
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  for (const s of sf.statements) {
    if (ts.isFunctionDeclaration(s) && s.body && s.name?.text === name) return s.body.getText(sf);
  }
  throw new Error(`${rel}: no function ${name}`);
}

const READS =
  /\b(createClient|getCurrentUser|getRealUser|getWorkspace|getAnalyticsOverview|fetchAllRows|signAttachment)\s*\(|\.from\(/;

describe("/requests", () => {
  const rel = "app/(dashboard)/requests/page.tsx";
  const shell = defaultExportBody(rel);
  const pane = functionBody(rel, "RequestsPane");
  it("keys the centre pane on requestsPaneKey, with a pane skeleton that announces itself", () => {
    expect(shell).toMatch(/<Suspense\s+key=\{requestsPaneKey\(sp\)\}\s+fallback=\{<RequestsPaneSkeleton\s*\/>\}>\s*<RequestsPane\s/);
    expect(functionBody(rel, "RequestsPaneSkeleton")).toMatch(/role="status"/);
  });
  it("keeps the rail outside the boundary, so a History click never remounts it (scroll and focus survive)", () => {
    const rail = shell.indexOf('aria-label="Requests navigation"');
    expect(shell.indexOf("<aside")).toBeGreaterThanOrEqual(0);
    expect(rail).toBeGreaterThan(shell.indexOf("<aside"));
    expect(rail).toBeLessThan(shell.indexOf("<Suspense"));
    expect(pane).not.toMatch(/<aside|Requests navigation/);
  });
  it("the rail resolves the open request from its own history, never from the thread read", () => {
    expect(shell).toMatch(/history\.find\(\(h\) => h\.id === sp\.id\)/);
    expect(shell).not.toMatch(/\bthread\b|transcript|signAttachment\(|persona_section/);
  });
  it("everything the pane reads happens inside the boundary", () => {
    expect(pane).toMatch(/\.eq\("id", sp\.id\)/);
    expect(pane).toMatch(/signAttachment\(/);
    expect(pane).toMatch(/persona_section, offers_section, rebuttals_section/);
    expect(pane).toMatch(/\.eq\("user_id", userId\)/);
  });
});

describe("/dashboard", () => {
  const rel = "app/(dashboard)/dashboard/page.tsx";
  const shell = defaultExportBody(rel);
  it("keys its body on ?bot=", () => {
    expect(shell).toMatch(/<Suspense\s+key=\{sp\.bot \?\? "all"\}\s+fallback=\{<DashboardBodySkeleton\s*\/>\}/);
  });
  it("reads nothing outside the boundary", () => {
    expect(shell).not.toMatch(READS);
  });
  it("its in-page skeleton announces itself", () => {
    expect(code(rel)).toMatch(/function DashboardBodySkeleton\(\)[\s\S]*?role="status"/);
  });
  it("keeps the header above the boundary, so a bot switch never unmounts it", () => {
    const header = shell.indexOf("<PageHeader");
    expect(header).toBeGreaterThanOrEqual(0);
    expect(header).toBeLessThan(shell.indexOf("<Suspense"));
  });
  it("its skeletons use the page's grid, so nothing shifts when the data lands", () => {
    const cols = (s: string) => s.match(/xl:grid-cols-\[[^\]]+\]/g) ?? [];
    const inPage = cols(functionBody(rel, "DashboardBodySkeleton"));
    expect(inPage.length).toBeGreaterThan(0);
    // loading.tsx is the same blocks under a header, so its columns match one for one.
    expect(cols(code("app/(dashboard)/dashboard/loading.tsx"))).toEqual(inPage);
    expect(new Set(cols(functionBody(rel, "DashboardBody")))).toEqual(new Set(inPage));
  });
});

describe("the composer's first message", () => {
  it("moves the URL only through createdRequestHref, so the /requests key does not flip", () => {
    const src = code("components/dashboard/request-chat.tsx");
    const replaces = callArgs(src, "router\\.replace");
    expect(replaces.length).toBeGreaterThan(0);
    // The whole argument list, not just the callee: both are strings, so tsc
    // cannot catch a swap, and swapped they flip the key and lose the thread.
    expect(replaces.map((a) => a.trim())).toEqual(["createdRequestHref(chatbotId, newId)"]);
    expect(src).not.toMatch(/\/requests\?id=/);
  });
});
