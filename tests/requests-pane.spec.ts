import { describe, expect, it } from "vitest";
import { createdRequestHref, requestsPaneKey } from "@/lib/requests-pane";

/** What the page's searchParams would be for this href. */
const spOf = (href: string) =>
  Object.fromEntries(new URL(href, "https://x.test").searchParams) as {
    id?: string;
    project?: string;
    category?: string;
  };

describe("requestsPaneKey", () => {
  it("does not change when the composer's first message creates the thread", () => {
    for (const composer of ["/requests?project=bot-1", "/requests?project=bot-1&category=offers"]) {
      expect(requestsPaneKey(spOf(createdRequestHref("bot-1", "cr-9")))).toBe(
        requestsPaneKey(spOf(composer))
      );
    }
  });

  it("changes for every view the rail links to", () => {
    // The rail's own hrefs: app/(dashboard)/requests/page.tsx "New request", ?id=, ?project=.
    const views = ["/requests", "/requests?id=cr-1", "/requests?id=cr-2", "/requests?project=bot-1", "/requests?project=bot-2"];
    expect(new Set(views.map((v) => requestsPaneKey(spOf(v)))).size).toBe(views.length);
  });

  it("ignores the chatbot switcher's ?bot=, which /requests does not read", () => {
    expect(requestsPaneKey(spOf("/requests?id=cr-1&bot=b2"))).toBe(requestsPaneKey(spOf("/requests?id=cr-1")));
  });

  it("the created-thread URL still names the thread and its chatbot", () => {
    expect(spOf(createdRequestHref("bot-1", "cr-9"))).toMatchObject({ id: "cr-9", project: "bot-1" });
  });
});
