import { describe, it, expect } from "vitest";
import { tagNamesFrom, bodyTagNames, hasBotOffTag, fetchSubscriberTagNames, isTaggedBotOff } from "@/lib/bot-off-tag";

/**
 * Live BOT_OFF tag check (lib/bot-off-tag.ts): the bot reads the contact's ManyChat tags
 * before sending, so a BOT_OFF tag that never synced still silences it. Fail-open.
 */
const okFetch = (tags: unknown) =>
  (async () => new Response(JSON.stringify({ status: "success", data: { tags } }), { status: 200 })) as unknown as typeof fetch;

describe("tag parsing", () => {
  it("reads ManyChat tag objects and plain strings", () => {
    expect(tagNamesFrom([{ id: 1, name: "BOT_OFF" }, "vip"])).toEqual(["BOT_OFF", "vip"]);
    expect(tagNamesFrom(undefined)).toBeNull();
  });
  it("reads Full Contact Data tags from the body", () => {
    expect(bodyTagNames({ contact: { id: "1", tags: [{ name: "BOT_OFF" }] } })).toEqual(["BOT_OFF"]);
    expect(bodyTagNames({ subscriber_id: "1", message: "hi" })).toBeNull();
  });
  it("matches BOT_OFF ignoring case and spaces, nothing else", () => {
    expect(hasBotOffTag(["bot_off "])).toBe(true);
    expect(hasBotOffTag(["BOT_ON", "lead"])).toBe(false);
    expect(hasBotOffTag(null)).toBe(false);
  });
});

describe("isTaggedBotOff", () => {
  it("uses the body's tags without calling ManyChat", async () => {
    const boom = (async () => { throw new Error("should not be called"); }) as unknown as typeof fetch;
    expect(await isTaggedBotOff({ body: { contact: { tags: [{ name: "BOT_OFF" }] } }, subscriberId: "1", apiKey: "k", fetchImpl: boom })).toBe(true);
    expect(await isTaggedBotOff({ body: { contact: { tags: [] } }, subscriberId: "1", apiKey: "k", fetchImpl: boom })).toBe(false);
  });
  it("asks ManyChat when the body has no tags", async () => {
    expect(await isTaggedBotOff({ body: {}, subscriberId: "1", apiKey: "k", fetchImpl: okFetch([{ name: "BOT_OFF" }]) })).toBe(true);
    expect(await isTaggedBotOff({ body: {}, subscriberId: "1", apiKey: "k", fetchImpl: okFetch([{ name: "lead" }]) })).toBe(false);
  });
  it("fails open: no key, an error, a non-200 or a bad answer all read as not tagged", async () => {
    expect(await isTaggedBotOff({ subscriberId: "1", apiKey: null })).toBe(false);
    const throws = (async () => { throw new Error("network"); }) as unknown as typeof fetch;
    expect(await fetchSubscriberTagNames("1", "k", { fetchImpl: throws })).toBeNull();
    const fails = (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    expect(await isTaggedBotOff({ subscriberId: "1", apiKey: "k", fetchImpl: fails })).toBe(false);
    const bad = (async () => new Response(JSON.stringify({ status: "error" }), { status: 200 })) as unknown as typeof fetch;
    expect(await isTaggedBotOff({ subscriberId: "1", apiKey: "k", fetchImpl: bad })).toBe(false);
  });
});
