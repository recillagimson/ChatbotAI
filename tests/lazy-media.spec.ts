import { describe, it, expect } from "vitest";
import { code, sourceFiles } from "./helpers/source";

/** Every self-closing <name ... /> element in comment-stripped source. */
const tags = (src: string, name: string) =>
  src.match(new RegExp(`<${name}\\b[\\s\\S]*?\\/>`, "g")) ?? [];

// Raw <img> tags that may leave loading to the browser default, and why.
const LOADING_OPTIONAL: Record<string, string> = {
  "components/brand/logo.tsx": "brand mark, above the fold, has width/height",
  "components/dashboard/request-composer.tsx": "local blob: preview in a fixed box",
  "components/dashboard/request-chat.tsx":
    "just-sent thumbnails are blob: URLs the composer revokes right after send; a deferred lazy fetch would race that",
};

describe("raw <img> tags choose how they load", () => {
  it("every raw <img> declares loading, except the listed exemptions", () => {
    let checked = 0;
    for (const file of sourceFiles().filter((f) => f.endsWith(".tsx"))) {
      if (file in LOADING_OPTIONAL) continue;
      for (const tag of tags(code(file), "img")) {
        checked++;
        expect(tag, `${file} needs a loading attribute: ${tag}`).toMatch(/\bloading=/);
      }
    }
    // asset-thumb, message-bubble, feedback-inbox, feedback-history, change-request-review
    expect(checked).toBeGreaterThanOrEqual(5);
  });

  it("request-chat thumbnails are never lazy (blob: URLs revoked right after send)", () => {
    const imgs = tags(code("components/dashboard/request-chat.tsx"), "img");
    expect(imgs.length).toBeGreaterThan(0);
    for (const t of imgs) expect(t).not.toMatch(/\blazy\b/);
  });

  it.each([
    "components/admin/feedback-inbox.tsx",
    "components/dashboard/feedback-history.tsx",
    "components/admin/change-request-review.tsx",
  ])("%s loads its attachments lazily and decodes off the main thread", (file) => {
    const imgs = tags(code(file), "img");
    expect(imgs.length).toBeGreaterThan(0);
    for (const t of imgs) {
      expect(t).toMatch(/loading="lazy"/);
      expect(t).toMatch(/decoding="async"/);
    }
  });
});

describe("thread images reserve their height without cropping", () => {
  const src = code("components/dashboard/message-bubble.tsx");
  const imgs = tags(src, "img");
  it("has exactly one image", () => expect(imgs).toHaveLength(1));
  const img = imgs[0] ?? "";
  it("keeps the image's own aspect ratio", () => {
    const cls = (img.match(/className="([^"]*)"/)?.[1] ?? "").split(/\s+/);
    expect(cls).toEqual(expect.arrayContaining(["max-h-60", "w-auto", "max-w-full", "object-contain"]));
    expect(cls).not.toContain("object-cover");
    expect(cls).not.toContain("h-60");
  });
  it("reserves 240px on the link, not on the img", () => {
    const at = src.indexOf("<img");
    const link = src.slice(src.lastIndexOf("<a", at), at);
    expect(link).toMatch(/className="[^"]*\bblock\b[^"]*"/);
    expect(link).toMatch(/className="[^"]*\bmin-h-60\b[^"]*"/);
  });
  it("fixes the video height so its metadata cannot move a pinned thread", () => {
    const vids = tags(src, "video");
    expect(vids).toHaveLength(1);
    const cls = ((vids[0] ?? "").match(/className="([^"]*)"/)?.[1] ?? "").split(/\s+/);
    expect(cls).toEqual(expect.arrayContaining(["h-60", "w-auto", "max-w-full"]));
    expect(cls).not.toContain("object-cover");
  });
  it("is lazy unless the thread marks it eager, and decodes async", () => {
    expect(img).toMatch(/loading=\{\s*eager\s*\?\s*"eager"\s*:\s*"lazy"\s*\}/);
    expect(img).toMatch(/decoding="async"/);
  });
  it("forwards the thread's eager flag to the attachment, lazy by default", () => {
    const att = tags(src, "Attachment");
    expect(att).toHaveLength(1);
    expect(att[0] ?? "").toMatch(/\beager=\{eagerMedia\}/);
    expect(src).toMatch(/\beagerMedia = false\b/);
  });
});

describe("the thread marks its newest images eager", () => {
  const page = code("app/(dashboard)/conversations/[id]/page.tsx");
  it("derives the set from messages whose URL resolved", () => {
    expect(page).toMatch(/newestImageIds\(/);
    expect(page).toMatch(/\.filter\(\(m\) => mediaUrls\.has\(m\.id\)\)/);
  });
  it("passes it to each bubble", () => {
    expect(page).toMatch(/<MessageBubble[\s\S]*?eagerMedia=\{eagerImages\.has\(m\.id\)\}/);
  });
});

describe("GHL booking calendars keep the embed as GHL issues it", () => {
  // form_embed.js hides every booking iframe it has not initialized (opacity 0,
  // left:-9999px, position:absolute) and shows it only after the widget inside
  // posts its one-time handshake. A loading="lazy" frame parked at -9999px never
  // nears the viewport, so it never loads and never shows. A script deferred
  // past window load (lazyOnload) can miss the handshake and leave it hidden.
  const embed = (src: string) =>
    tags(src, "Script").find((s) => s.includes("form_embed.js")) ?? "";
  it.each(["app/page.tsx", "app/book-a-call/page.tsx"])(
    "%s: the calendar iframe is not lazy and form_embed.js loads afterInteractive",
    (file) => {
      const src = code(file);
      const frames = tags(src, "iframe");
      expect(frames).toHaveLength(1);
      expect(frames[0]).not.toMatch(/\blazy\b/);
      expect(embed(src)).toMatch(/strategy="afterInteractive"/);
    },
  );
  it("the landing's calendar comes from config, not a hardcoded widget", () => {
    const landing = code("app/page.tsx");
    expect(landing).toMatch(/process\.env\.NEXT_PUBLIC_BOOKING_URL/);
    expect(landing).not.toMatch(/leadconnectorhq\.com\/widget\/booking\/[A-Za-z0-9]/);
  });
});
