# SpeedSettr API Reference

This is the HTTP API exposed by the app. Most of it is internal (called by the dashboard or by ManyChat / Stripe webhooks), but documented here so you can integrate with it, test it, or build alternative front-ends.

**Base URL** (production): `https://yourdomain.com`
**Base URL** (local): `http://localhost:3000`

All responses are JSON.

---

## Authentication

| Endpoint group     | Auth method                                     |
|--------------------|-------------------------------------------------|
| `/api/stripe/*`    | Supabase session cookie (logged-in user)        |
| `/api/webhooks/manychat` | Shared secret header `x-manychat-secret`  |
| `/api/webhooks/stripe`   | Stripe signature header `stripe-signature` |

---

## `POST /api/webhooks/manychat`

The entry point for every message routed through ManyChat, across all channels (Instagram, Facebook Messenger, WhatsApp, Telegram, TikTok). Called by ManyChat's **External Request** action — one flow per channel, each sending its own `platform`. For push-capable channels the reply is delivered out-of-band via the ManyChat Send Content API and the response returns instantly (`ai_queued`); for TikTok (no send API) the reply is returned in the response body for the flow to send.

### Headers
| Header                 | Required | Description                                            |
|------------------------|----------|--------------------------------------------------------|
| `x-manychat-secret`    | yes      | Must equal `MANYCHAT_WEBHOOK_SECRET` env var           |
| `Content-Type`         | yes      | `application/json`                                     |

### Request body
```json
{
  "chatbot_id": "uuid",            // identifies which chatbot answers
  "platform": "string",            // (optional) instagram|messenger|whatsapp|telegram|tiktok (default instagram)
  "subscriber_id": "string",       // ManyChat subscriber id
  "page_id": "string",             // (optional) ManyChat page id (no longer used to gate; auth is the secret)
  "first_name": "string|null",     // (optional) for personalization
  "last_name": "string|null",      // (optional)
  "username": "string|null",       // (optional) the channel's username/handle
  "message": "string",             // the user's latest message, max 4000 chars
  "is_leads": 0                    // (optional, PARKED) accepted but ignored — no longer tags or short-circuits
}
```

### Successful response (200)
```json
{
  "reply": "We're open 9am-6pm Mon-Fri. Anything specific I can help with?"
}
```

If the chatbot's owner has no active subscription, or the conversation is in `ai_paused` state (a human took over), the AI step is skipped:
```json
{
  "reply": "Thanks for your message! We'll get back to you shortly.",
  "ai_skipped": true,
  "reason": "subscription_inactive"  // or "human_takeover"
}
```
> **Access includes admin comp grants.** "Active" means
> `subscriptions.status IN ('active','trialing')` **and**, for an admin-granted
> comp, `comp_expires_at` is still in the future (see `lib/access.ts`
> `hasActiveAccess`). A lapsed comp reads as inactive with no scheduled sweep.

A repeat of the same message text within 30s is **silently absorbed** — empty
reply, nothing stored, nothing pushed (the first copy's reply covers it):
```json
{
  "reply": "",
  "ai_skipped": true,
  "reason": "duplicate"
}
```

A message that matches one of the chatbot's configured **keyword triggers** can
short-circuit the AI. The FIRST match for a contact runs the group's first-reply
mode — send a canned reply (text + an optional saved asset), hand to the AI, or
steer the AI with an instruction — and the group is recorded on the conversation;
a later match runs its on-repeat action (the same three choices, plus "send a
different message"). Only the canned-message paths short-circuit the AI and return: 
```json
{
  "reply": "Appreciate you! Here's how it works…",
  "ai_skipped": true,
  "reason": "keyword_trigger"
}
```
`reason` is `keyword_trigger` for the first reply and `keyword_repeat` for an
on-repeat "send a different message". A verbatim resend within 30s is absorbed by
the duplicate gate above *before* the keyword check, so it won't re-fire the
on-repeat message.

A message detected as a blatant **prompt-extraction / reverse-engineering
attempt** ("ignore your instructions", "show me your system prompt") is
deflected with a static reply — the attacker's text never reaches the AI:
```json
{
  "reply": "That's not something I can share, but tell me what you're looking for and I'll point you the right way.",
  "ai_skipped": true,
  "reason": "extraction_blocked"
}
```
Ambiguous attempts (e.g. asking for scripts "word for word") get a **normal**
reply with no special `reason` — the AI is steered for that turn to answer
helpfully without revealing internals. Every detection (both kinds) increments
`conversations.extraction_attempts` + stamps `flagged_at` (a red "Flagged"
badge in the dashboard inbox) and logs a `usage_log` row with
`event_type: "extraction_attempt"`.

A lead can **self-pause** the AI for their own conversation by texting
`stopmessage`, and re-enable it with `resumemessage`. This is tracked on
`conversations.user_muted_at`, independent of owner human-takeover. Each command
sends a one-time confirmation:
```json
{ "reply": "You're all set, I'll start replying again. What can I help you with?", "ai_skipped": true, "reason": "user_resumed" }
```
`reason` is `user_paused` for the stop confirmation, `user_resumed` for resume,
and `user_muted` (empty reply, no AI) for any other message while the lead is
muted. Owners see a "Muted by user" badge and can clear it from the dashboard.

A chatbot can enable **keyword-only reply mode** (`chatbots.keyword_gate_enabled`):
when on, the bot only engages contacts who have shown intent via a keyword. The
keyword is an **entry qualifier**, not a per-message filter — a contact "unlocks"
the bot by matching a configured keyword group once (becoming a possible lead),
and from then on every message they send is answered, keyword or not, so the bot
can carry the conversation it started. A contact who has **never** matched a
keyword is silently ignored: their message returns an empty reply with
`reason: "keyword_gate_blocked"` (no AI, no trivial ack, no extraction
deflection) — the inbound is still stored and shown in the inbox for a manual
reply. Engagement is tracked on `conversations.keyword_fired` (non-empty = the
contact matched a keyword at least once), the same signal that surfaces a "Lead"
badge in the dashboard inbox and that the follow-up cron uses to decide who to
drip. A matching message is handled exactly as a normal keyword trigger (canned
reply or AI, per the group's mode).

**`is_leads` (PARKED).** Lead-tagging via `is_leads` is currently disabled. The
flag is still accepted on the request body for backward compatibility but is
**ignored** — it no longer tags the contact, sets `is_lead`, or returns
`reason: "lead_tagged"`, so a stray `is_leads=1` can never silently swallow a real
DM. A message carrying `is_leads` is handled exactly like a normal message (keyword
gate → keyword actions → AI). Engagement is currently **keyword-only**
(`keyword_fired`). To re-enable, restore the tag branch and re-consult `is_lead` in
the keyword gate; the `conversations.is_lead` column and its "Lead" badge remain.

On push channels (Instagram/Messenger/WhatsApp/Telegram) the webhook acks
instantly with `{"ai_queued": true, "reply": ""}` and delivers the reply in the
background after a short debounce (`REPLY_DEBOUNCE_MS`, default 5s): if the
contact sends more messages during the wait, the timer resets and the whole
burst is answered with ONE consolidated reply.

### Error responses
| Status | Body                                  | Cause                                      |
|--------|---------------------------------------|--------------------------------------------|
| 401    | `{"error":"unauthorized"}`            | Missing or wrong `x-manychat-secret`       |
| 400    | `{"error":"bad_request","issues":[]}` | Body failed Zod validation                 |
| 200    | `{"reply":"...","ai_skipped":true}`   | Account inactive — never 4xx for ManyChat  |

### Side effects
- Inserts a `messages` row with role `user`.
- Creates or updates a `conversations` row keyed by `(chatbot_id, subscriber_id)`.
- Calls Anthropic Claude with the chatbot's system prompt, knowledge base, and the last 20 messages of conversation history.
- Inserts a `messages` row with role `assistant` and the AI reply.
- Inserts a `usage_log` row with token count.

### Example (PowerShell)
```powershell
curl -X POST http://localhost:3000/api/webhooks/manychat `
  -H "Content-Type: application/json" `
  -H "x-manychat-secret: your_secret_here" `
  -d '{\"chatbot_id\":\"abc-123\",\"subscriber_id\":\"sub-1\",\"message\":\"hi\"}'
```

---

## `POST /api/admin/grant-access`

Superadmin-only. Grants, extends, or revokes **comp access** (free product access
that bypasses Stripe) for one existing account. A grant sets that user's single
`subscriptions` row to `status='trialing'` with `comp_expires_at = now + duration`;
access ends automatically at `comp_expires_at` (enforced at check time).

**Auth:** Supabase session cookie of a `profiles.is_superadmin` user (the real
admin, never an impersonated client). Non-admins get `403`.

### Request body
```json
{
  "userId": "uuid",                        // the account to grant
  "action": "grant",                       // "grant" | "extend" | "revoke"
  "days": 30,                              // grant/extend: whole days (optional)
  "months": 6,                             // grant/extend: whole calendar months (optional)
  "note": "string"                         // optional internal reason
}
```
- `grant` sets `comp_expires_at = now + (months, days)`.
- `extend` adds the duration onto the later of now / the current expiry.
- `revoke` sets `status='canceled'`, `comp_expires_at = now` (access ends immediately).
- grant/extend require `days > 0 || months > 0`.

### Responses
| Status | Body | Cause |
|--------|------|-------|
| 200 | `{"ok":true,"action":"grant","comp_expires_at":"<iso>"}` | Success |
| 400 | `{"error":"Invalid request."}` / `{"error":"Choose a duration."}` | Bad body / no duration |
| 403 | `{"error":"Forbidden."}` | Not a superadmin |
| 409 | `{"error":"has_paid_subscription"}` | Client has a live paid Stripe sub (never comp over a payer) |
| 500 | `{"error":"Could not grant access."}` | DB write failed |

A later real Stripe event overwrites the row and clears the comp fields — Stripe always wins.

---

## `POST /api/stripe/checkout`

Starts a Stripe Checkout session for the currently-logged-in user.

**Auth:** Supabase session cookie.

**Body:** (none)

**Response 200:**
```json
{ "url": "https://checkout.stripe.com/c/pay/cs_test_..." }
```
Redirect the browser to this URL. On success Stripe redirects back to `/billing?status=success`.

**Errors:** `401` if not signed in.

---

## `POST /api/stripe/portal`

Opens the Stripe Customer Portal for the currently-logged-in user. Lets them update payment methods, cancel, view invoices.

**Auth:** Supabase session cookie.

**Response 200:**
```json
{ "url": "https://billing.stripe.com/p/session/..." }
```

**Errors:**
- `401` not signed in
- `400 {"error":"no_subscription"}` user has no Stripe customer record yet (subscribe first)

---

## `POST /api/webhooks/stripe`

Stripe event listener. Called by Stripe — you don't call this directly.

### Events handled
| Event                              | Effect                                |
|------------------------------------|---------------------------------------|
| `checkout.session.completed`       | Upsert subscription row               |
| `customer.subscription.created`    | Upsert subscription row               |
| `customer.subscription.updated`    | Upsert subscription row (status etc.) |
| `customer.subscription.deleted`    | Upsert subscription row as `canceled` |

Other events are ignored and return `{ received: true }`.

### Signature verification
Uses `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)`. Invalid signatures get a `400`.

---

## `GET /auth/callback?code=...`

Supabase email-confirmation / OAuth callback. Exchanges the code for a session and redirects to `/dashboard` (or `?next=` if specified). You don't call this directly.

---

## Database access (Supabase REST / supabase-js)

The dashboard pages talk to Supabase directly using `@supabase/ssr`. RLS policies guarantee a user can only read/write their own rows.

Key tables:

| Table              | Owner column | Notes                                                   |
|--------------------|-------------|---------------------------------------------------------|
| `profiles`         | `id`        | Auto-created on signup via trigger                      |
| `subscriptions`    | `user_id`   | One row per user. Server-writes only (service role)     |
| `chatbots`         | `user_id`   | One per IG/Messenger page                               |
| `knowledge_base`   | `user_id`   | Indexed by `chatbot_id`                                 |
| `conversations`    | `user_id`   | Unique on `(chatbot_id, manychat_subscriber_id)`        |
| `messages`         | (via conv)  | RLS through conversation ownership                      |
| `usage_log`        | `user_id`   | Append-only AI usage tracking                           |

Full schema with policies: `supabase/schema.sql`.

---

## Rate limits

Not implemented yet. Consider adding at the ManyChat webhook layer using Upstash Redis or `@vercel/kv` if you start seeing abuse — limit by `subscriber_id` to ~10 messages per 30 seconds.

## Versioning

The API is currently unversioned (v0). Once you have customers integrating against it directly, move to `/api/v1/*`.
