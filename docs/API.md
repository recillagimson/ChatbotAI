# ChatPilot API Reference

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

The entry point for every Instagram or Messenger message routed through ManyChat. Called by ManyChat's **External Request** action. Returns an AI-generated reply that ManyChat sends back to the user.

### Headers
| Header                 | Required | Description                                            |
|------------------------|----------|--------------------------------------------------------|
| `x-manychat-secret`    | yes      | Must equal `MANYCHAT_WEBHOOK_SECRET` env var           |
| `Content-Type`         | yes      | `application/json`                                     |

### Request body
```json
{
  "chatbot_id": "uuid",            // identifies which chatbot answers
  "subscriber_id": "string",       // ManyChat subscriber id
  "page_id": "string",             // (optional) ManyChat page id
  "first_name": "string|null",     // (optional) for personalization
  "last_name": "string|null",      // (optional)
  "username": "string|null",       // (optional) IG handle
  "message": "string"              // the user's latest message, max 4000 chars
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
