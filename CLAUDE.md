# SpeedSettr — Project Context for Claude

> This file is auto-loaded every time Claude opens this project. It tells future Claude (or a fresh session) where we are and what's next. **Read this first.**

## What this project is

A SaaS platform (**SpeedSettr** — www.speedsettr.com) that auto-replies to Instagram and Messenger DMs using AI. Setty.ai-style. Small businesses subscribe at $997/mo and get a chatbot trained on their FAQ.

- **Owner:** Franco / Gimson (highthriveva@gmail.com)
- **Built:** May 2026
- **Status as of last session:** **Local MVP fully working end-to-end.** Auth + Stripe billing + AI replies all validated locally via curl. Not yet deployed to Vercel. Not yet connected to a real Instagram account via ManyChat (boss's IG awaiting verification).

## Stack (locked in)

- **Framework:** Next.js 15 (App Router) + TypeScript
- **Database + Auth:** Supabase (Postgres + Row Level Security + Supabase Auth)
- **AI:** Anthropic Claude (`claude-sonnet-4-6`)
- **Billing:** Stripe ($349/mo single plan, test mode for now)
- **Instagram/Messenger:** ManyChat (user has Pro account) — we are NOT building direct Meta Graph API
- **Deployment target:** Vercel (not deployed yet)
- **Styling:** Tailwind + minimal shadcn-style components

**Why ManyChat over Meta API:** ship faster, no Meta App Review (2-6 week wait). Each customer wires their own IG → ManyChat → our `/api/webhooks/manychat` endpoint.

## What's been done ✅

1. Full project scaffolded (~40 files, see `README.md` for layout)
2. Supabase schema deployed with RLS — see `supabase/schema.sql`
3. Anthropic, Stripe, ManyChat lib helpers built
4. Auth pages (login/signup) wired with Supabase Auth
5. Dashboard: overview, chatbots, conversations, knowledge base, settings, billing, onboarding
6. API routes: ManyChat webhook (AI reply), Stripe checkout, Stripe portal, Stripe webhook
7. Landing page
8. **Validated locally**: signup → subscribe with test card `4242 4242 4242 4242` → create chatbot → add knowledge → curl webhook → got real AI reply citing knowledge base
9. Documentation: `SETUP.md` (step-by-step setup), `docs/API.md` (API reference)

## What's NOT done (next session — in order)

### Priority 1 — Deploy to Vercel (~30 min)
- Push to a private GitHub repo
- Import to Vercel
- Paste all `.env.local` values into Vercel env (NOTE: get a NEW `STRIPE_WEBHOOK_SECRET` from a real Stripe dashboard webhook endpoint, not the CLI value)
- Update `NEXT_PUBLIC_APP_URL` to the Vercel URL
- Add Vercel URL to Supabase → Auth → URL Configuration (Site URL + Redirect URLs)
- Create production Stripe webhook endpoint at `https://<vercel-url>/api/webhooks/stripe`
- See `SETUP.md` §7 for full steps

### Priority 2 — AI response improvements (user requested)
- Tune the system prompt in `lib/anthropic.ts` — currently 320-char DM-style replies, friendly tone
- Consider: longer responses for product questions, shorter for greetings, emoji rules per tone
- Try different tones in the chatbot creator and see if the AI matches
- Consider adding few-shot examples to the system prompt
- File: `lib/anthropic.ts` → `buildSystemPrompt()`

### Priority 3 — Live Instagram test via ManyChat (when boss's IG is verified)
- Connect IG account in ManyChat (Settings → Channels → Instagram)
- Build the "AI Reply" flow in ManyChat — see `SETUP.md` §5c and `/chatbots/[id]` page in dashboard for the exact JSON body
- Critical: paste the same `MANYCHAT_WEBHOOK_SECRET` value from `.env.local` into the ManyChat header
- Use the chatbot UUID from the dashboard in the flow body
- Map response field `reply` to a ManyChat custom field, then Send Message with that field

### Priority 4 — Pre-launch polish (after deploy works)
- Password reset flow (`/forgot-password`, `/reset-password`)
- Rate limiting on `/api/webhooks/manychat` (Upstash Redis or `@vercel/kv`)
- `/health` endpoint
- Turn email confirmations back ON in Supabase
- PDF/docx upload for knowledge base (currently paste-text only)

## Known gotchas / things future-Claude should NOT redo

1. **Don't put the project in OneDrive.** OneDrive's "Files On-Demand" symlink behavior breaks Next.js's `.next/server/webpack-runtime.js` with `EINVAL: invalid argument, readlink` errors. We moved it out once already. If you see that error again, the project crept back into OneDrive — move it to `C:\dev\Chatbot-Highthrive` or similar.

2. **Don't propose direct Meta Graph API.** User explicitly chose ManyChat for speed-to-market. Customers bring their own ManyChat accounts; we are not multi-tenant on ManyChat itself.

3. **`MANYCHAT_WEBHOOK_SECRET` is invented by us, not from ManyChat.** ManyChat's "API key" is a different thing (the colon-separated `pageId:token` format). The webhook secret is a shared password we paste into the External Request header in ManyChat.

4. **Never put real secrets in `.env.example`.** That file is for placeholder templates only — it's the file that gets committed. Real values go in `.env.local` (gitignored).

5. **The user is the founder, not the deep technical owner.** Bias toward writing complete code and giving click-by-click instructions for third-party tools (Stripe, Supabase, ManyChat dashboards). Don't ask them to fill in implementation details.

6. **Brand:** The product is **SpeedSettr** (www.speedsettr.com). Logo assets live in `public/brand/` (app-icon, icon-color, horizontal lockups); the favicon is `app/icon.svg`; the reusable mark+wordmark is `components/brand/logo.tsx` (`<Logo dark />` on dark surfaces). The lockup art spells it "Speedsettr" (lowercase s) but the app text uses "SpeedSettr" — confirm canonical casing with the owner. NOTE: internal Redis key prefixes still use `chatpilot:` (in `lib/limits.ts`) — leave them; they're invisible namespaces, not the brand, and renaming would reset live counters.

## How to verify the local setup still works (resume sanity check)

1. `npm run dev` in the project folder.
2. In another window from `C:\Users\recil\Downloads\stripe_1.41.2_windows_x86_64`:
   ```powershell
   .\stripe.exe listen --forward-to localhost:3000/api/webhooks/stripe
   ```
   ⚠️ This generates a **new** `whsec_...`. Update `.env.local` and restart `npm run dev` if it changed.
3. Open <http://localhost:3000>, log in with the credentials created in the previous session.
4. Send a test message:
   ```powershell
   $secret = "<value of MANYCHAT_WEBHOOK_SECRET from .env.local>"
   $chatbotId = "<UUID of a chatbot you created — see /chatbots>"
   $body = @{ chatbot_id=$chatbotId; subscriber_id="test-2"; message="what are your hours?" } | ConvertTo-Json
   Invoke-RestMethod -Uri "http://localhost:3000/api/webhooks/manychat" -Method POST -Headers @{ "x-manychat-secret"=$secret; "Content-Type"="application/json" } -Body $body
   ```
   Expected: a JSON `reply` field with an AI-generated answer.

## Files to read first if you need to orient

- `README.md` — architecture diagram + file layout
- `SETUP.md` — every external-account setup step (Supabase, Stripe, ManyChat, Anthropic, Vercel)
- `docs/API.md` — HTTP API reference
- `supabase/schema.sql` — database tables + RLS policies
- `lib/anthropic.ts` — AI prompt construction (this is what you tune to improve replies)
- `app/api/webhooks/manychat/route.ts` — the core AI reply endpoint (entry point for every DM)

## A note about how the user works

The user prefers to be walked through external-account setup step by step ("step by step please"). They are not a deep TypeScript engineer — they're a founder using Claude as their developer. Write code end-to-end. For third-party UIs (Stripe dashboard, ManyChat, Meta Business), give explicit click paths. They'll happily share screenshots when stuck.
