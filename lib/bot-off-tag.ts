/**
 * Live BOT_OFF tag check against ManyChat.
 *
 * The BOT_OFF tag normally reaches us through the owner's "tag added" automation, which
 * posts `bot_off: true` and sets conversations.bot_off_at (CLAUDE.md #29). That sync can
 * miss: a tag added in bulk, a contact tagged before they ever messaged, or an automation
 * that is off. So before the bot sends anything (a reply, the welcome VM, a follow-up) it
 * also reads the contact's tags from ManyChat itself and stays silent if BOT_OFF is there.
 *
 * Tags come from the request's Full Contact Data when the flow sends it (no API call),
 * else from ManyChat's subscriber/getInfo. Fail-open: an unreadable answer is `null`,
 * which callers treat as "not tagged", so a ManyChat blip never silences a real lead.
 * Multi-tenant: the tag name is a platform-wide constant, never a client literal.
 */

export const BOT_OFF_TAG = process.env.MANYCHAT_BOT_OFF_TAG || "BOT_OFF";

/** Tag names from a ManyChat `tags` array ([{name}] or plain strings). null = no array. */
export function tagNamesFrom(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const names: string[] = [];
  for (const t of raw) {
    if (typeof t === "string") names.push(t);
    else if (t && typeof t === "object" && typeof (t as { name?: unknown }).name === "string") {
      names.push((t as { name: string }).name);
    }
  }
  return names;
}

/** Tags carried in the webhook body (Full Contact Data `contact.tags`, or a top-level `tags`). */
export function bodyTagNames(body: unknown): string[] | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const contact = b.contact && typeof b.contact === "object" ? (b.contact as Record<string, unknown>) : null;
  return tagNamesFrom(contact?.tags) ?? tagNamesFrom(b.tags);
}

/** Does this tag list hold the BOT_OFF tag? Case and surrounding spaces ignored. */
export function hasBotOffTag(names: string[] | null, tag: string = BOT_OFF_TAG): boolean {
  if (!names) return false;
  const want = tag.trim().toLowerCase();
  return names.some((n) => n.trim().toLowerCase() === want);
}

/** The contact's tag names from ManyChat, or null when they can't be read. Never throws. */
export async function fetchSubscriberTagNames(
  subscriberId: string,
  apiKey: string,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}
): Promise<string[] | null> {
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch(
      `https://api.manychat.com/fb/subscriber/getInfo?subscriber_id=${encodeURIComponent(subscriberId)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 2_500),
      }
    );
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as { status?: string; data?: { tags?: unknown } } | null;
    if (json?.status !== "success") return null;
    return tagNamesFrom(json.data?.tags) ?? [];
  } catch {
    return null;
  }
}

/**
 * Is this contact tagged BOT_OFF in ManyChat right now? Uses the body's tags when present,
 * otherwise asks ManyChat. false on any failure (fail-open).
 */
export async function isTaggedBotOff(opts: {
  body?: unknown;
  subscriberId: string;
  apiKey: string | null;
  fetchImpl?: typeof fetch;
}): Promise<boolean> {
  const fromBody = bodyTagNames(opts.body);
  if (fromBody) return hasBotOffTag(fromBody);
  if (!opts.apiKey) return false;
  return hasBotOffTag(await fetchSubscriberTagNames(opts.subscriberId, opts.apiKey, { fetchImpl: opts.fetchImpl }));
}
