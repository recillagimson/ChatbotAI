import { describe, it, expect } from "vitest";
import {
  cleanLiveChatUrl,
  manychatConversationUrl,
  MANYCHAT_LIVE_CHAT_URL,
} from "@/lib/manual-followups";

/**
 * The "Open in ManyChat" deep link. The queue used to point every card at the ManyChat
 * account root; these two pure helpers turn a conversation's stored ids into a link that
 * opens the ACTUAL thread, with a safe fallback so the button is never dead.
 *
 *  - cleanLiveChatUrl: only an absolute https URL on a manychat.com host survives, so an
 *    un-rendered merge field / blank / off-domain value can never be stored or clicked.
 *  - manychatConversationUrl: prefers the stored live_chat_url, else builds
 *    fb{page_id}/chat/{subscriber_id}, else falls back to the account root.
 */

describe("cleanLiveChatUrl", () => {
  it("accepts a real ManyChat Live Chat URL verbatim (both hosts)", () => {
    const app = "https://app.manychat.com/fb123/chat/456";
    const bare = "https://manychat.com/fb123/chat/456";
    expect(cleanLiveChatUrl(app)).toBe(app);
    expect(cleanLiveChatUrl(bare)).toBe(bare);
    expect(cleanLiveChatUrl("  https://app.manychat.com/fb1/chat/2  ")).toBe(
      "https://app.manychat.com/fb1/chat/2"
    );
  });

  it("rejects un-rendered merge fields, blanks, and nullish", () => {
    expect(cleanLiveChatUrl("{{live_chat_url}}")).toBeNull();
    expect(cleanLiveChatUrl("")).toBeNull();
    expect(cleanLiveChatUrl("   ")).toBeNull();
    expect(cleanLiveChatUrl(null)).toBeNull();
    expect(cleanLiveChatUrl(undefined)).toBeNull();
  });

  it("rejects off-domain and non-https URLs (never link somewhere else)", () => {
    expect(cleanLiveChatUrl("https://evil.example.com/fb1/chat/2")).toBeNull();
    // A look-alike host must not pass - the dot before manychat.com is required.
    expect(cleanLiveChatUrl("https://notmanychat.com/x")).toBeNull();
    expect(cleanLiveChatUrl("http://app.manychat.com/fb1/chat/2")).toBeNull();
    expect(cleanLiveChatUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("manychatConversationUrl", () => {
  it("prefers a stored live_chat_url over building one - on ANY channel", () => {
    // live_chat_url is channel-safe, so it wins even for whatsapp where the built
    // fb-link would be skipped entirely.
    expect(
      manychatConversationUrl({
        liveChatUrl: "https://manychat.com/fb999/chat/888",
        pageId: "111",
        subscriberId: "222",
        platform: "whatsapp",
      })
    ).toBe("https://manychat.com/fb999/chat/888");
  });

  it("builds fb{page_id}/chat/{subscriber_id} for the confirmed channels", () => {
    expect(
      manychatConversationUrl({ pageId: "111", subscriberId: "222", platform: "instagram" })
    ).toBe("https://app.manychat.com/fb111/chat/222");
    expect(
      manychatConversationUrl({ pageId: "111", subscriberId: "222", platform: "messenger" })
    ).toBe("https://app.manychat.com/fb111/chat/222");
  });

  it("does NOT build an fb-link on unconfirmed channels - falls back to the root", () => {
    // WhatsApp reaches the manual queue, but the fb-link shape is unverified there, so a
    // stored page_id must NOT produce a guessed link (would be a wrong link, not a dead one).
    expect(
      manychatConversationUrl({ pageId: "111", subscriberId: "222", platform: "whatsapp" })
    ).toBe(MANYCHAT_LIVE_CHAT_URL);
    // Unknown/absent platform is treated as unconfirmed too.
    expect(
      manychatConversationUrl({ pageId: "111", subscriberId: "222" })
    ).toBe(MANYCHAT_LIVE_CHAT_URL);
  });

  it("ignores a junk live_chat_url and falls through to the built link", () => {
    expect(
      manychatConversationUrl({
        liveChatUrl: "{{live_chat_url}}",
        pageId: "111",
        subscriberId: "222",
        platform: "instagram",
      })
    ).toBe("https://app.manychat.com/fb111/chat/222");
  });

  it("URL-encodes the ids defensively", () => {
    expect(
      manychatConversationUrl({ pageId: "1 1/x", subscriberId: "a b", platform: "instagram" })
    ).toBe("https://app.manychat.com/fb1%201%2Fx/chat/a%20b");
  });

  it("falls back to the account root when the page id is unknown", () => {
    expect(
      manychatConversationUrl({ liveChatUrl: null, pageId: null, subscriberId: "222", platform: "instagram" })
    ).toBe(MANYCHAT_LIVE_CHAT_URL);
    // A blank page id (not just null) also falls back.
    expect(
      manychatConversationUrl({ pageId: "   ", subscriberId: "222", platform: "instagram" })
    ).toBe(MANYCHAT_LIVE_CHAT_URL);
  });

  it("falls back to the account root when there is nothing to build from", () => {
    expect(manychatConversationUrl({})).toBe(MANYCHAT_LIVE_CHAT_URL);
  });
});
