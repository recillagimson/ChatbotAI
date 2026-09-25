import { readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
// Next's OWN compilation of `config.matcher` (what `next build` writes into the
// middleware manifest) and its own per-request matcher. getMiddlewareMatchers is
// exported at runtime but missing from Next's .d.ts, hence the typed cast.
import * as staticInfo from "next/dist/build/analysis/get-page-static-info";
import type { MiddlewareMatcher } from "next/dist/build/analysis/get-page-static-info";
import { getMiddlewareRouteMatcher } from "next/dist/shared/lib/router/utils/middleware-route-matcher";
import { config } from "@/middleware";
import sitemap from "@/app/sitemap";
import { ROOT, read } from "./helpers/source";

const { getMiddlewareMatchers } = staticInfo as unknown as {
  getMiddlewareMatchers: (matchers: string[], nextConfig: Record<string, unknown>) => MiddlewareMatcher[];
};
// next.config.ts sets neither i18n nor basePath, the only inputs that change the compiled regex.
const matchesPath = getMiddlewareRouteMatcher(getMiddlewareMatchers(config.matcher, {}));
/** Would middleware run for this URL? Next's matcher only ever sees the pathname. */
const runs = (url: string) =>
  matchesPath(new URL(url, "https://x.test").pathname, {} as never, {} as never);

const families = (group: string) =>
  readdirSync(path.join(ROOT, "app", group), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `/${d.name}`);

describe("middleware matcher", () => {
  it.each(sitemap().map((e) => new URL(e.url).pathname))("public page %s skips middleware", (p) => {
    expect(runs(p)).toBe(false);
  });

  // Read from disk, so a new legal page that was left off app/sitemap.ts is caught too.
  it.each([...families("(legal)"), "/book-a-call"])("public page %s (from disk) skips middleware", (p) => {
    expect(runs(p)).toBe(false);
    expect(runs(`${p}.rsc`)).toBe(false);
  });

  it.each(["/?code=x", "/?_rsc=1", "/index.rsc", "/robots.txt", "/sitemap.xml", "/opengraph-image?abc", "/twitter-image?abc", "/icon.svg", "/book-a-call/"])(
    "%s skips middleware",
    (u) => expect(runs(u)).toBe(false)
  );

  it.each([...families("(dashboard)"), ...families("(auth)"), ...families("(admin)")])(
    "%s keeps middleware, so its session keeps refreshing",
    (p) => {
      expect(runs(p)).toBe(true);
      expect(runs(`${p}/abc?x=1`)).toBe(true);
    }
  );

  it.each(["/auth/callback?code=x", "/api/change-requests/chat", "/privacy-settings", "/terms-x", "/index"])(
    "%s keeps middleware",
    (u) => expect(runs(u)).toBe(true)
  );

  it("still skips the webhook and static assets", () => {
    for (const u of ["/api/webhooks/manychat", "/_next/static/chunks/a.js", "/favicon.ico"]) {
      expect(runs(u)).toBe(false);
    }
  });

  // next build reads config.matcher from the SOURCE (an SWC AST walk), not from
  // the module's runtime value. A concatenation, a template with an expression or
  // a named const has the same runtime value, so every case above still passes,
  // but next build extracts no matcher from it.
  it("config.matcher is one plain string literal, so next build can read it", () => {
    const sf = ts.createSourceFile("middleware.ts", read("middleware.ts"), ts.ScriptTarget.Latest, true);
    const isConfig = (d: ts.VariableDeclaration) => ts.isIdentifier(d.name) && d.name.text === "config";
    const stmt = sf.statements.find(
      (s): s is ts.VariableStatement => ts.isVariableStatement(s) && s.declarationList.declarations.some(isConfig)
    );
    // Next only looks at `export const config = ...`.
    expect(stmt?.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)).toBe(true);
    expect(stmt && stmt.declarationList.flags & ts.NodeFlags.Const).toBeTruthy();
    const init = stmt?.declarationList.declarations.find(isConfig)?.initializer;
    const matcher =
      init && ts.isObjectLiteralExpression(init)
        ? init.properties.find(
            (p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText(sf) === "matcher"
          )
        : undefined;
    const elements =
      matcher && ts.isArrayLiteralExpression(matcher.initializer) ? [...matcher.initializer.elements] : [];
    expect(elements.map((e) => (ts.isStringLiteralLike(e) ? e.text : ts.SyntaxKind[e.kind]))).toEqual(config.matcher);
  });
});
