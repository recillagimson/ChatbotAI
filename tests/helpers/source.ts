import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

/**
 * Helpers for STATIC source assertions (tests that read our own .ts files).
 *
 * Why a real parser for comments: tests/dashboard-row-bounds.spec.ts strips
 * comments with two regexes, which is fine for the files it reads but wrong in
 * general. A string such as "image/*" or "*\/*" reads to a regex as the start
 * of a block comment and silently erases real code up to the next "*\/", and
 * the files these newer tests scan include ones that contain exactly that.
 * TypeScript's parser knows what is a string and what is a comment.
 */

export const ROOT = path.resolve(__dirname, "..", "..");

export const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

/** Source with every comment removed. Newlines and all code are kept. */
export function stripComments(src: string, fileName = "file.tsx"): string {
  // Parse .ts as TS and .tsx as TSX. The two grammars differ: in TSX,
  // `<T>value` and `<T>() => x` read as JSX, which would leave their comments
  // unstripped.
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, kind);

  const ranges = new Map<number, number>();
  const jsxText: Array<[number, number]> = [];
  const collect = (pos: number) => {
    for (const r of ts.getLeadingCommentRanges(src, pos) ?? []) ranges.set(r.pos, r.end);
    for (const r of ts.getTrailingCommentRanges(src, pos) ?? []) ranges.set(r.pos, r.end);
  };
  // getChildren (unlike forEachChild) includes TOKENS, so a comment in any
  // trivia position is reached, including {/* ... */} inside JSX.
  const visit = (node: ts.Node) => {
    if (node.kind === ts.SyntaxKind.JsxText) {
      jsxText.push([node.pos, node.end]);
      return;
    }
    collect(node.getFullStart());
    collect(node.getEnd());
    for (const child of node.getChildren(sf)) visit(child);
  };
  visit(sf);

  // JSX text is page content, not trivia, and it may legitimately contain "//"
  // or "/*" (a URL, a code sample). The scanner above can still report it as a
  // comment when a neighbouring token's position lands inside it, so drop any
  // range that starts within JSX text.
  const inJsxText = (pos: number) => jsxText.some(([s, e]) => pos >= s && pos < e);

  let out = "";
  let at = 0;
  for (const [pos, end] of [...ranges].sort((a, b) => a[0] - b[0])) {
    if (pos < at || inJsxText(pos)) continue;
    out += src.slice(at, pos);
    at = end;
  }
  return out + src.slice(at);
}

/** A repo file with its comments stripped, so prose can neither satisfy nor break a rule. */
export const code = (rel: string) => stripComments(read(rel), rel);

export const walk = (dir: string): string[] =>
  readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory()
      ? walk(path.posix.join(dir, d.name))
      : d.name.endsWith(".ts") || d.name.endsWith(".tsx")
        ? [path.posix.join(dir, d.name)]
        : []
  );

/** Every application source file (not tests, not scripts). */
export const sourceFiles = () => [
  ...walk("app"),
  ...walk("lib"),
  ...walk("components"),
  "middleware.ts",
];

/**
 * The argument text of every call to `fn` in `src`, found by balancing
 * parentheses from the call's opening one. `src` should already be
 * comment-stripped. Declarations (`function fn(`) are skipped.
 */
export function callArgs(src: string, fn: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`(^|[^\\w.])${fn}\\s*\\(`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const before = src.slice(Math.max(0, m.index - 20), m.index + m[1].length);
    if (/function\s*$/.test(before)) continue;
    let depth = 0;
    const open = m.index + m[0].length - 1;
    for (let i = open; i < src.length; i++) {
      const ch = src[i];
      if (ch === "(") depth++;
      else if (ch === ")" && --depth === 0) {
        out.push(src.slice(open + 1, i));
        break;
      }
    }
  }
  return out;
}
