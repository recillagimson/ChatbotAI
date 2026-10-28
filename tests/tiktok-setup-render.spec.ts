import { describe, it, expect, vi, beforeAll } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { hasUnicodeDash } from "@/lib/sanitize";

/**
 * What an owner sees for TikTok, rendered to HTML.
 *
 *  - The Connection tab's "Connect TikTok" card: the TikTok body to paste, and a flow
 *    that clears the reply field first and sends only when it has a value (a silent
 *    turn returns an empty reply, which must not re-send the last one).
 *  - The inbox on a TikTok thread: no composer whose Send can only fail, but where to
 *    reply instead. Other channels keep the composer.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

let Card: (typeof import("@/components/dashboard/tiktok-setup-card"))["TikTokSetupCard"];
let ReplyBox: (typeof import("@/components/dashboard/conversation-reply-box"))["ConversationReplyBox"];
beforeAll(async () => {
  ({ TikTokSetupCard: Card } = await import("@/components/dashboard/tiktok-setup-card"));
  ({ ConversationReplyBox: ReplyBox } = await import("@/components/dashboard/conversation-reply-box"));
}, 120_000);

/** The visible text of rendered HTML. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

const BOT = "6f1e2d3c-4b5a-4968-8776-655443322110";
const LIVE_CHAT = "https://app.manychat.com/fb123/chat/456";

describe("the Connect TikTok card", () => {
  const html = () => renderToStaticMarkup(createElement(Card, { chatbotId: BOT }));

  it("gives this bot's TikTok body", () => {
    const t = text(html());
    expect(t).toContain(`"chatbot_id": "${BOT}"`);
    expect(t).toContain(`"platform": "tiktok"`);
    expect(t).toContain("<Full Contact Data>");
  });

  it("clears the reply field first and sends only when it has a value", () => {
    const t = text(html());
    expect(t).toContain("Clear Custom Field");
    expect(t).toContain("Response Mapping");
    expect(t).toMatch(/ai_reply has any value/);
    expect(t.indexOf("Clear Custom Field")).toBeLessThan(t.indexOf("External Request"));
  });

  it("states the account and region requirement and what TikTok can't do", () => {
    const t = text(html());
    expect(t).toContain("TikTok Business account");
    expect(t).toContain("EU, the UK or Switzerland");
    expect(t).toMatch(/Follow-ups, videos and voice notes, link buttons, the welcome voice message and replying from the inbox/);
  });

  it("explains the optional picture step: clear and map the field, one Condition per picture", () => {
    const t = text(html());
    expect(t).toContain("one picture per reply");
    expect(t).toContain("Let the AI send media on its own");
    expect(t).toMatch(/clear a text field named ai_media/);
    expect(t).toMatch(/map media_key to ai_media/);
    expect(t).toMatch(/Condition ai_media is that picture's key/);
  });

  it("offers the simpler way: pick a ManyChat flow for an item on the Media tab", () => {
    const t = text(html());
    expect(t).toMatch(/On the Media tab, click Edit on an item and pick a TikTok flow/);
    expect(t).toMatch(/no Condition needed/);
  });

  it("is the anchor the Connection card links to, and uses no em or en dashes", () => {
    expect(html()).toContain('id="connect-tiktok"');
    expect(hasUnicodeDash(text(html()))).toBe(false);
  });
});

describe("the inbox reply box on a TikTok thread", () => {
  const box = (props: Record<string, unknown>) =>
    renderToStaticMarkup(createElement(ReplyBox, { conversationId: "c1", botSilent: true, ...props } as never));

  it("shows where to reply instead of a composer, with the ManyChat link", () => {
    const html = box({ platform: "tiktok", liveChatUrl: LIVE_CHAT });
    expect(html).not.toContain("<textarea");
    expect(text(html)).toContain("Replies to TikTok contacts can't be sent from here");
    expect(text(html)).toContain("Reply in the TikTok app or in ManyChat's Live Chat");
    expect(html).toContain(`href="${LIVE_CHAT}"`);
    expect(hasUnicodeDash(text(html))).toBe(false);
  });

  it("while the AI is handling the thread, says how to take over", () => {
    const t = text(box({ platform: "tiktok", botSilent: false }));
    expect(t).toContain("The AI is handling this thread");
    expect(t).toContain("pause the AI above and reply in the TikTok app");
    expect(t).not.toContain("Open in ManyChat");
    expect(hasUnicodeDash(t)).toBe(false);
  });

  it("other channels, and a thread with no channel stored, keep the composer", () => {
    expect(box({ platform: "instagram" })).toContain("<textarea");
    expect(box({})).toContain("<textarea");
  });
});
