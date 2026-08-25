/**
 * ManyChat "Full Contact Data" support.
 *
 * ManyChat does NOT JSON-escape the merge fields it substitutes into a hand-built
 * External Request body. So when a lead's message (Last Text Input) contains a
 * newline/tab/quote - e.g. a multi-paragraph job application - the substituted body
 * becomes invalid JSON ("Bad control character in string literal"), and ManyChat's own
 * validator BLOCKS the request before it ever reaches us. The message is silently lost.
 *
 * The robust fix is to send ManyChat's own "Full Contact Data" object - which ManyChat
 * serializes and escapes itself, so control characters are always valid - as a nested
 * `contact` field, keeping the static routing fields (chatbot_id, platform) at the top:
 *
 *   {
 *     "chatbot_id": "<id>",
 *     "platform": "instagram",
 *     "contact": { ...Full Contact Data... }
 *   }
 *
 * This flattens that nested object into the flat top-level fields BodySchema expects,
 * WITHOUT overwriting an explicitly-set top-level value - so the legacy flat body still
 * works unchanged and this is a no-op when there is no `contact` object. Multi-tenant:
 * no client literals; any bot can opt in by switching its ManyChat body to this shape.
 *
 * Identity note: we deliberately fall `username` back to the IG @handle (`ig_username`),
 * NOT the numeric `ig_id` - the returning-contact carry-over + its backfill key IG on the
 * @handle, so keeping the same anchor avoids a split identity. `name` (a full display
 * name with spaces) is intentionally not used as a handle; resolveExternalId would reject
 * it anyway, and displayName already derives from first/last name.
 */
export function flattenManychatContact(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const r = raw as Record<string, unknown>;
  const c = r.contact;
  if (!c || typeof c !== "object" || Array.isArray(c)) return raw;
  const cc = c as Record<string, unknown>;

  // Keep an explicit top-level value; otherwise take the first real value from the
  // contact object. Treats null/"" as absent so a blank top-level field still heals.
  const pick = (top: unknown, ...fallbacks: unknown[]): unknown => {
    if (top !== undefined && top !== null && top !== "") return top;
    for (const v of fallbacks) if (v !== undefined && v !== null && v !== "") return v;
    return top;
  };

  return {
    ...r,
    subscriber_id: pick(r.subscriber_id, cc.id),
    message: pick(r.message, cc.last_input_text),
    username: pick(r.username, cc.ig_username, cc.user_name),
    first_name: pick(r.first_name, cc.first_name),
    last_name: pick(r.last_name, cc.last_name),
    page_id: pick(r.page_id, cc.page_id),
    // ManyChat's own per-contact Live Chat deep link, part of Full Contact Data. Hoisted
    // so the "Add Full Subscriber Data" path (the robust, channel-safe way to capture it)
    // surfaces it for storage - the Follow-ups queue deep-links to it. See
    // manychatConversationUrl in lib/manual-followups.ts.
    live_chat_url: pick(r.live_chat_url, cc.live_chat_url),
  };
}
