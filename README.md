# SpeedSettr

AI chatbot SaaS for Instagram and Messenger DMs. Small businesses subscribe ($349/mo), connect their Instagram via ManyChat, paste their FAQ, and the AI handles their DMs 24/7.

**Stack:** Next.js 15 (App Router) · TypeScript · Supabase (DB + Auth) · Anthropic Claude · Stripe · ManyChat · Tailwind · deployed on Vercel.

## Quick start

```powershell
npm install
Copy-Item .env.example .env.local
# fill .env.local - see SETUP.md for every value
npm run dev
```

Then open <http://localhost:3000>.

## Full setup guide

**Read [SETUP.md](./SETUP.md)** - it walks you click-by-click through Supabase, Anthropic, Stripe, ManyChat, and Vercel deployment.

## Architecture overview

```
┌──────────────────┐                                    ┌──────────────────┐
│  IG / Messenger  │                                    │   Your customer  │
│      user        │                                    │  (small biz)     │
└────────┬─────────┘                                    └────────┬─────────┘
         │ DM                                                    │ subscribes
         ▼                                                       ▼
┌──────────────────┐  webhook   ┌────────────────────┐  HTTP    ┌──────────────────┐
│    ManyChat      │ ─────────▶ │ /api/webhooks/     │ ─────▶   │     Stripe       │
│ (each customer's │            │   manychat         │          │  ($349 / mo)     │
│  own account)    │ ◀───────── │  → Claude reply    │          └────────┬─────────┘
└──────────────────┘   reply    │  → save to Supabase│                   │ webhook
                                └────────┬───────────┘                   ▼
                                         │                      ┌──────────────────┐
                                         ▼                      │   /api/webhooks/ │
                                ┌────────────────────┐          │     stripe       │
                                │      Supabase      │ ◀────────┤  → upserts sub   │
                                │ Postgres + Auth +  │          └──────────────────┘
                                │  RLS               │
                                └────────────────────┘
                                         ▲
                                         │  reads
                                         │
                                ┌────────┴───────────┐
                                │  Customer's        │
                                │  SpeedSettr         │
                                │  dashboard         │
                                └────────────────────┘
```

## API documentation

See [docs/API.md](./docs/API.md).

## File layout

```
app/
  (auth)/                 - login, signup screens (public)
  (dashboard)/            - protected app pages
    chatbots/             - list, new, [id] manage
    conversations/        - inbox + thread view
    knowledge-base/       - train the AI
    settings/             - profile + ManyChat connection guide
    billing/              - Stripe subscription
    onboarding/           - post-signup flow
  api/
    webhooks/manychat/    - receives DMs from ManyChat, returns AI reply
    webhooks/stripe/      - Stripe subscription state sync
    stripe/checkout/      - start subscription checkout
    stripe/portal/        - open Stripe customer portal
  auth/callback/          - Supabase email-confirm callback
  page.tsx                - marketing landing page

lib/
  supabase/               - browser, server, and middleware clients
  anthropic.ts            - Claude system-prompt builder + reply generation
  stripe.ts               - Stripe SDK config
  manychat.ts             - secret verification + optional send-message helper
  types.ts                - shared TypeScript types

supabase/
  schema.sql              - full database schema with RLS policies
```
