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
- **AI:** OpenAI (default, `gpt-4.1-mini`) for DM replies + change-request AI; Anthropic Claude available via `AI_PROVIDER=anthropic`
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
- Critical: in the ManyChat External Request header `x-manychat-secret`, paste the per-chatbot webhook secret shown on the Chatbots → [your bot] page (each chatbot has its own; the global `MANYCHAT_WEBHOOK_SECRET` env var is only a fallback for an un-migrated bot).
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

3. **ManyChat credentials are now per-chatbot, managed in-app.** Each chatbot row on the `chatbots` table carries its own `manychat_api_key_enc` (AES-256-GCM ciphertext, decrypted server-side via `lib/crypto.ts`) and `webhook_secret` (plaintext, shown to the owner and rotatable on the chatbot page). Inbound webhook auth checks the chatbot's own `webhook_secret` against the `x-manychat-secret` header, falling back to the global `MANYCHAT_WEBHOOK_SECRET` env var for un-migrated bots. Outbound sends use the chatbot's decrypted key, falling back to the global `MANYCHAT_API_KEY`; a present-but-undecryptable key HARD-FAILS (never falls back) to prevent cross-tenant delivery. The master encryption key is `CREDENTIALS_ENC_KEY` (64 hex chars, required once any customer saves a key). Resolution logic lives in `lib/manychat.ts` → `resolveManychatApiKey`. The global env vars remain only as fallbacks for the original single-bot setup.

4. **Never put real secrets in `.env.example`.** That file is for placeholder templates only — it's the file that gets committed. Real values go in `.env.local` (gitignored).

5. **The user is the founder, not the deep technical owner.** Bias toward writing complete code and giving click-by-click instructions for third-party tools (Stripe, Supabase, ManyChat dashboards). Don't ask them to fill in implementation details.

6. **Brand (refreshed per the SPEEDSETTR blueprint, `~/Downloads/brandguide`):** The product is **SpeedSettr** (www.speedsettr.com). **Palette:** primary indigo `#6366f1` + deep navy `#1e1b4b` + white — driven by HSL CSS variables in `app/globals.css` (`--primary` 239 84% 67%, `--sidebar` 244 47% 20%), so a palette change there propagates app-wide. The deep marketing/auth panel bg is `#15123a`; light indigo accents are `#818cf8`/`#a5b4fc`/`#c7d2fe`. **Fonts:** display = **Sora** (heavy geometric sans, weights 500–800) + body = **Manrope** (set in `app/layout.tsx`; `font-display` → Sora via `tailwind.config.ts`). The old Fraunces serif + violet `#6B2FB5`/`#2E0A52` are fully retired. **Logo:** the mark is a speech bubble holding a lightning bolt + rising arrow (chat + speed + lead conversion). `components/brand/logo.tsx` renders the **original brand artwork** (from `~/Downloads/brandguide` IMG_2905 lockup + IMG_2909 icon) — background-removed (PIL distance-to-white key, lo42/hi66) + autocropped + optimized to **WebP** in `public/brand/`. The component uses the **full-color** lockup (`logo-lockup.webp`) on ALL surfaces; on `dark` placements (sidebar/hero/auth-panel/footer/admin nav) it wraps the color logo in a **white rounded chip** (so the navy "SPEED" stays legible on navy) — chosen over the flat white knockout after a visual treatment comparison. Logo height is enlarged: `h-10` (md) / `h-8` (sm); the chip (~52px) fits the fixed `h-16` headers, so no header-height change was needed. Props: `dark` (white chip), `size="sm"`, `showWordmark={false}` (color icon only). The `logo-lockup-white.webp` / `logo-icon-white.webp` knockout assets are kept but no longer referenced. To regenerate from new source art, re-run the PIL key/crop/resize pipeline. Favicon stays the crisp vector `app/icon.svg` (on-brand mark on a navy tile); the older `app-icon.svg`/`icon-color.svg`/`lockup-horizontal-*.svg` are leftover vector assets, not used by the component. Wordmark casing is all-caps "SPEEDSETTR"; tagline "RAPID LEAD CONVERSION AI". NOTE: internal Redis key prefixes still use `chatpilot:` (in `lib/limits.ts`) — leave them; they're invisible namespaces, not the brand, and renaming would reset live counters.

7. **Superadmin console (`/admin`) is RLS-gated, not service-role.** Team-only access is the `profiles.is_superadmin` boolean, surfaced through the `public.is_superadmin()` security-definer helper, which keys *permissive RLS overlays* on `chatbots`/`knowledge_base`/`profiles`/`subscriptions`/`conversations`/`usage_log` plus the new `change_requests` + `feedback` tables. So a superadmin's normal `createClient()` transparently sees/edits every tenant while regular users stay scoped to their own rows — do NOT reach for `createServiceClient()` in admin code (the only service-role use is KB indexing in the publish path). The `(admin)` route group's layout redirects non-superadmins to `/dashboard`. **Owner action: set `is_superadmin = true` on the team's `profiles` row** (`update public.profiles set is_superadmin = true where email = 'highthriveva@gmail.com';`) — nobody can reach `/admin` until then. Change requests: a client submits free text → **OpenAI (`gpt-4.1-mini`)** auto-drafts a new `system_prompt` + KB entries (`draftChangeRequest` in `lib/openai-changes.ts`, forced tool-use) → the team reviews and does a two-step **Approve → Publish** (Approve never touches the live bot; Publish writes `chatbots.system_prompt` and inserts KB rows **with the chatbot owner's `user_id`, never the admin's**). Never `select *` on `chatbots` in admin views (secret columns).

8. **Request Changes is a Claude-style chat (`/requests`); Feedback is its own page (`/feedback`).** Clients no longer use the one-shot form (removed). The chat (`components/dashboard/request-chat.tsx` + `request-composer.tsx`) supports text, **image upload** (sent as vision), **document upload** (PDF/DOCX/TXT/MD/CSV — extracted to text server-side via `lib/document-parser.ts` `extractTextFromFile` and folded into the user's message so the AI reads it; sent as a separate `files:[{path,name,type}]` array, capped at `MAX_DOC_CHARS`), and **voice→text** (mic → `/api/transcribe` → OpenAI Whisper via raw fetch reusing `OPENAI_API_KEY`, no SDK). The assistant is fed the bot's FULL current knowledge (title + content via `buildFullContextBlock`, capped at `KB_CHAR_BUDGET`) plus the current prompt, and is instructed to REVISE the current prompt (not rewrite) and only add genuinely new KB facts. Each chat thread is a `change_requests` row in the new **`draft`** status with the conversation in `transcript jsonb`; the scoped assistant is `chatTurn` in `lib/openai-changes.ts` (**OpenAI `gpt-4.1-mini`**, raw fetch, vision via `image_url` data-URLs, `OPENAI_CHANGE_MODEL` override) — it takes a `Pick<Chatbot, …safe fields>` (secrets structurally unreachable), its system prompt hard-refuses credential/billing/off-project topics, and the only actionable output is the same `propose_changes` tool. NOTE: the DM-reply path (`generateReply` in `lib/anthropic.ts`) now also runs on **OpenAI by default** (`DM_AI_PROVIDER`, model `OPENAI_DM_MODEL` default `gpt-4.1-mini`, via `lib/openai.ts` `openaiChat`); set `AI_PROVIDER=anthropic` to switch it back to Claude. `buildSystemPrompt` is provider-agnostic. `gpt-4o-mini` was tried and rejected — it under-calls the tool (asks endlessly instead of proposing). Drafts never reach the team queue; an explicit client **Submit** (`/api/change-requests/[id]/submit`) flips `draft → pending`. The admin review (`/admin/requests/[id]`) shows the full transcript + image attachments and ignores drafts. Attachments (chat + feedback) live in the **private `request-uploads` Storage bucket** under `{user_id}/{scope}/…`, enforced by per-user storage RLS + an explicit `path.startsWith(user.id+"/")` server check, served via short-lived signed URLs (`lib/storage.ts`). **Owner action: apply the "request-changes chat assistant + attachments" section of `supabase/schema.sql`** (adds the `draft` status, `transcript`/`title`, `feedback.attachments`, and the bucket + storage policies) — the SA1 superadmin schema must already be applied. No new env vars.

9. **Multi-channel via ManyChat (Instagram + Facebook Messenger + WhatsApp + Telegram + TikTok).** `lib/platforms.ts` is the single source of truth: `Platform` type, `PLATFORM_META` (label, ManyChat `content.type`, `canPush`, follow-up window). Inbound: the webhook reads a `platform` field from the body (one ManyChat flow per channel sends a literal value; legacy IG flow omits it → defaults `instagram`) and stores it on `conversations.platform`. Outbound: `sendManychatMessage({platform})` sets `content.type` (instagram/messenger/whatsapp/telegram). **TikTok has NO ManyChat send API** (`canPush=false`, beta, no EU/UK) — its replies are generated synchronously and returned in the webhook RESPONSE body (the client's TikTok flow sends them); the webhook branches on `canPushPlatform`: push channels keep the fast-ack + `unstable_after` background push, TikTok generates inline. The inbox (`/conversations`) has platform tabs (`?platform=`) + a `PlatformBadge`. Manual agent replies and follow-ups are platform-aware (TikTok manual reply returns a 422 "reply in the app"; follow-up windows come from `PLATFORM_META`). The `page_id` cross-tenant guard was dropped — auth is the per-chatbot `webhook_secret` (one chatbot now spans channels with different page_ids). **Owner action: apply the "Multi-channel support" section of `supabase/schema.sql`** (adds `conversations.platform` + index) before this works; existing rows default to `instagram`. No new env vars.

10. **Three-section prompts + category-aware Request Changes (selective approval).** A chatbot's behavior is authored as **three sections** on `chatbots`: `persona_section` (Personality/Tone — leads as identity), `offers_section` (Offers/services/inclusions/exclusions/links), `rebuttals_section` (Rebuttals/FAQs). `buildSystemPrompt` (`lib/anthropic.ts`) assembles them (persona verbatim → offers → rebuttals → KB → fixed `GUARDRAILS`) and **falls back to the legacy `system_prompt` / `business_description`+`tone` path only when all three are empty** — so un-migrated bots are unaffected. The legacy columns are kept (not dropped). On the **prompts page** (`chatbot-edit-form.tsx`) the owner edits **only Personality** directly (plus a "Upload file → convert to text" button → `POST /api/documents/extract`, stateless, reuses `lib/document-parser.ts`); **Offers & Rebuttals are read-only** there with a "Request a change" CTA (`/requests?category=offers|rebuttals`). Request Changes is now **category-scoped** via `lib/change-categories.ts` (`SECTION_BY_CATEGORY`, `CATEGORY_LABELS`, `sectionColumnFor`, `autoAppliesWithoutApproval`): `change_requests.category` ∈ `personality|offers|rebuttals|other`. The chat (`chatTurn`) is fed the **current section text** for the category and returns the FULL revised `section_content` (for "other" it returns `kb_entries`); `parseProposalInput(input, category)` maps it to `proposed.{section, section_content}` (tolerating a legacy `system_prompt`). **Approval routing:** **Personality auto-applies** with no admin — `POST /api/change-requests/[id]/apply` writes `persona_section` via the owner's own RLS client, then stamps the request `applied` via `createServiceClient()` (the ONE justified service-client use outside KB indexing: `change_requests` UPDATE is admin-only by RLS, and it runs only after full owner auth, scoped by `user_id` — not privilege escalation, the owner can write that column directly anyway). **Offers/Rebuttals/Other still require admin approval** (submit → pending → Approve → Publish): Approve carries `section_content` into `final`; Publish writes it to `SECTION_BY_CATEGORY[category]` (legacy rows fall back to `system_prompt`). Both the client (`request-chat.tsx`) and admin (`change-request-review.tsx`) show a **before/after** of the section. Em-dash sanitization stays outbound-only — do NOT sanitize stored section content. KB page keeps its own inline editing (separate path; known parallel to the approval-gated "Other" category). **Owner action: apply the "Three-section prompt authoring + category-aware Request Change" section of `supabase/schema.sql`** (adds the 3 section columns + backfill of `persona_section` from `system_prompt`/`business_description`, and `change_requests.category`) before this works. No new env vars.

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
