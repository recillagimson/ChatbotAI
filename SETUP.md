# SpeedSettr — Setup Guide

This is your **end-to-end checklist** to take the platform from empty folder → live, paying customers.

Go through every section in order. Each one starts with **what you do** and ends with **what to paste into `.env.local`**.

---

## TL;DR — what you need to do (master checklist)

- [Done] **1.** Install Node.js 20+ and run `npm install`
- [ ] **2.** Create a Supabase project and run the schema
- [ ] **3.** Get an Anthropic API key
- [ ] **4.** Create a Stripe product ($349/mo) and grab keys
- [ ] **5.** Configure your ManyChat Pro account (Instagram + External Request flow)
- [ ] **6.** Fill `.env.local` with all values above
- [ ] **7.** Run `npm run dev` and test end-to-end
- [ ] **8.** Deploy to Vercel and set env vars there
- [ ] **9.** Update the Stripe webhook endpoint and ManyChat webhook URL to the Vercel URL
- [ ] **10.** Buy a domain, point it at Vercel, launch

Estimated total time: **2–3 hours** if all accounts are fresh, **~45 minutes** if you have them already.

---

## 1. Install Node + dependencies

You need **Node.js 20 or higher** (check with `node -v`). If you don't have it: <https://nodejs.org>.

In this folder, in PowerShell:

```powershell
npm install
```

Then copy the env template:

```powershell
Copy-Item .env.example .env.local
```

You'll fill it in as you go through the sections below.

---

## 2. Supabase (database + auth)

### 2a. Create the project
1. Go to <https://supabase.com> → **Start your project** → sign in.
2. Click **New project**. Choose any org, name it `chatpilot`, set a strong DB password (save it somewhere), pick the region closest to your customers.
3. Wait ~2 minutes for it to provision.

### 2b. Run the schema
1. In the Supabase dashboard, click **SQL Editor** in the left sidebar → **New query**.
2. Open the file `supabase/schema.sql` from this project, copy its **entire contents**, paste it into the SQL editor, and click **Run**.
3. You should see `Success. No rows returned`. The tables are now created with Row Level Security enabled.

### 2c. Configure auth
1. In Supabase → **Authentication → Providers → Email**:
   - Make sure **Email** is enabled.
   - For local dev convenience: turn **off** "Confirm email" (you can re-enable in production). This lets you sign up and log in immediately without checking email.
2. In **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:3000` (you'll change this to your Vercel URL later).
   - **Redirect URLs**: add `http://localhost:3000/**` and later your production URL `https://yourdomain.com/**`.

### 2d. Grab the API keys
1. **Settings → API** in Supabase.
2. Copy these into `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=        # "Project URL"
   NEXT_PUBLIC_SUPABASE_ANON_KEY=   # "anon public" key
   SUPABASE_SERVICE_ROLE_KEY=       # "service_role" key — KEEP SECRET, server-only
   ```

> The `service_role` key bypasses Row Level Security. It is used by our webhook handlers (ManyChat, Stripe) which run on the server and can't use a logged-in user session. Never expose it on the client.

---

## 3. Anthropic Claude (the AI)

1. Go to <https://console.anthropic.com> → sign up / log in.
2. **Billing → Add credits**: minimum $5 is fine to start. The Claude Sonnet 4.6 model costs roughly $0.003 per typical DM reply, so $5 ≈ ~1,600 replies.
3. **API Keys → Create Key**. Name it `chatpilot-prod`. Copy it (you only see it once).
4. Paste into `.env.local`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ANTHROPIC_MODEL=claude-sonnet-4-6
   ```

---

## 4. Stripe (billing)

### 4a. Create the product
1. Go to <https://dashboard.stripe.com> and sign in (or sign up).
2. Stay in **Test mode** for now (toggle top-right).
3. **Products → Add product**:
   - Name: `SpeedSettr Professional`
   - Description: `AI replies for Instagram & Messenger DMs`
   - Pricing model: **Standard pricing → Recurring**
   - Price: `349.00 USD`, billed **monthly**.
   - Save product.
4. On the product page, copy the **Price ID** (looks like `price_1Q...`). Paste into `.env.local`:
   ```
   STRIPE_PRICE_ID=price_...
   ```

### 4b. Grab API keys
1. **Developers → API keys**.
2. Copy into `.env.local`:
   ```
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_SECRET_KEY=sk_test_...
   ```

### 4c. Webhook (local dev)
For local testing, install the Stripe CLI: <https://stripe.com/docs/stripe-cli>.

Then in a separate PowerShell window:
```powershell
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

It prints a webhook secret like `whsec_...`. Paste it into `.env.local`:
```
STRIPE_WEBHOOK_SECRET=whsec_...
```

Keep the `stripe listen` process running whenever you test billing locally.

### 4d. Webhook (production — do this after deploying to Vercel)
1. **Developers → Webhooks → Add endpoint**.
2. Endpoint URL: `https://yourdomain.com/api/webhooks/stripe` (or your Vercel URL).
3. Events to send: select these four:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. After creating, reveal the **Signing secret** and update `STRIPE_WEBHOOK_SECRET` in **Vercel** env vars.

### 4e. Enable customer portal
1. **Settings → Billing → Customer portal**.
2. Activate it. Enable: update payment method, cancel subscription, view invoices.
3. Save.

---

## 5. ManyChat (Instagram + Messenger)

You said you have a **Pro account**. Here is the exact setup:

### 5a. Connect Instagram (one-time)
1. In ManyChat, go to your account.
2. **Settings → Channels → Instagram** → click **Connect**.
3. Follow the Facebook/Meta flow to authorize your Instagram Business Account. (Your IG must be a Business or Creator account, linked to a Facebook Page. ManyChat will prompt you if it isn't.)

### 5b. Pick a secret value
Invent a long random string. Paste it into `.env.local`:
```
MANYCHAT_WEBHOOK_SECRET=paste-a-long-random-string-here-at-least-32-chars
```
You'll paste the **same string** into the ManyChat header below.

### 5c. Build the AI Reply flow in ManyChat
1. **Automation → New Flow → Start from scratch**. Name it `AI Reply`.
2. Trigger: **+ → Default Reply** (this fires for any incoming message that doesn't match another trigger). For Instagram-only also add **Instagram → DM** trigger.
3. Add an action: **+ → Actions → External Request**.
   - Method: **POST**
   - URL: `http://localhost:3000/api/webhooks/manychat` (for testing — switch to your production URL once deployed)
   - Headers (click **Add Header**):
     - Key: `x-manychat-secret`
     - Value: *(paste the same secret string from step 5b)*
     - Key: `Content-Type`
     - Value: `application/json`
   - Body (Raw / JSON):
     ```json
     {
       "chatbot_id": "PASTE_CHATBOT_ID_FROM_DASHBOARD",
       "subscriber_id": "{{subscriber_id}}",
       "page_id": "{{page_id}}",
       "first_name": "{{first_name}}",
       "last_name": "{{last_name}}",
       "username": "{{ig_username}}",
       "message": "{{last_input_text}}"
     }
     ```
   - In **Response Mapping**: map the JSON field `reply` to a new custom field called `ai_reply` (text).
4. After the External Request, add a **Send Message** action that posts the value of the `ai_reply` custom field as a text message.
5. **Publish** the flow.

> The `chatbot_id` comes from `/chatbots/[id]` in your dashboard — copy the UUID after creating a chatbot in step 7.

### 5d. ManyChat API key (optional)
Only needed if you later want to send proactive follow-up messages from the backend (we have `sendManychatMessage` for this).
1. ManyChat → **Settings → API**.
2. Generate API key. Paste into `.env.local`:
   ```
   MANYCHAT_API_KEY=...
   ```

---

## 6. Run it locally

In your project folder:
```powershell
npm run dev
```

Open <http://localhost:3000>. You should see the landing page.

### Smoke test
1. Click **Get started** → create an account (email/password). You should be redirected to `/onboarding`.
2. Click **Activate subscription** → **Subscribe → $349/mo**. Stripe checkout opens. Use the test card `4242 4242 4242 4242`, any future expiry, any CVC.
3. After payment, Stripe redirects to `/billing?status=success`. The webhook (your `stripe listen` window) updates the subscription. Refresh `/billing` and you should see **Active**.
4. Go to **Chatbots → New chatbot** → fill in business name + description → create. Copy the chatbot UUID from the URL.
5. **Knowledge Base** → add a sample entry like `"Hours: We are open 9am to 6pm, Monday to Friday."`
6. **Test the ManyChat webhook directly** without needing a real DM. In a new PowerShell:
   ```powershell
   curl -X POST http://localhost:3000/api/webhooks/manychat `
     -H "Content-Type: application/json" `
     -H "x-manychat-secret: YOUR_SECRET" `
     -d '{\"chatbot_id\":\"YOUR_CHATBOT_UUID\",\"subscriber_id\":\"test-1\",\"message\":\"what are your hours?\"}'
   ```
   You should get a JSON reply with the AI answer. The conversation appears in `/conversations`.
7. Go to ManyChat, paste your chatbot UUID into the flow's body, and send yourself a DM from another Instagram account to verify end-to-end.

---

## 7. Deploy to Vercel

### 7a. Push to GitHub
1. Create a new GitHub repo (private).
2. In this folder:
   ```powershell
   git init
   git add .
   git commit -m "initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USER/chatpilot.git
   git push -u origin main
   ```

### 7b. Import to Vercel
1. <https://vercel.com> → **Add New → Project** → import your GitHub repo.
2. Framework preset: **Next.js** (detected automatically).
3. **Environment Variables**: paste **every** value from `.env.local` (except `NEXT_PUBLIC_APP_URL` — set that to your future production URL like `https://chatpilot.app` or the auto-assigned `https://chatpilot.vercel.app`).
4. Deploy.

### 7c. After deploy
1. Copy your Vercel URL.
2. **Supabase → Authentication → URL Configuration**: add the Vercel URL to both Site URL and Redirect URLs.
3. **Stripe**: complete section 4d above (production webhook) using your Vercel URL.
4. **ManyChat**: open your AI Reply flow, change the External Request URL from `localhost:3000` to your Vercel URL. Republish.
5. **NEXT_PUBLIC_APP_URL** in Vercel env: update to the Vercel/custom-domain URL. Redeploy.

### 7d. Custom domain (optional)
1. Buy a domain (Namecheap, Cloudflare, Porkbun — any).
2. Vercel → your project → **Settings → Domains → Add**. Follow Vercel's DNS instructions.
3. Once live, update Supabase + Stripe + ManyChat URLs again to the custom domain.
4. **Switch Stripe out of test mode**: regenerate `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_ID`, and `STRIPE_WEBHOOK_SECRET` in Vercel using **live mode** values.

---

## 8. What to do when a real customer signs up

You don't have to do anything technical per customer. The flow is:
1. They sign up at your URL.
2. They pay via Stripe.
3. They create a chatbot, add knowledge.
4. They open `/settings`, follow the 6-step ManyChat guide (this is shown in the app).
5. They paste the chatbot UUID into their own ManyChat flow.

**Important:** each customer needs their own ManyChat account to connect their own Instagram. ManyChat is not multi-tenant on your side — only the AI/inbox is. (See "Pro tip" below for a workaround.)

> **Pro tip — managed onboarding:** for white-glove service, you can offer to do the ManyChat setup for them. They invite you to their ManyChat workspace (Settings → Team), you build the flow with their chatbot UUID, done. This is a great way to justify $349/mo.

---

## 9. Things I (Claude) intentionally did NOT build (for now)

These are explicit next-step features if you want them later:
- **Email confirmations** (the schema supports it; just turn the toggle back on in Supabase auth).
- **Password reset flow** — add `/forgot-password` and `/reset-password` pages using `supabase.auth.resetPasswordForEmail`.
- **File upload for knowledge base** (PDF/docx) — would need Supabase Storage + a PDF parser. Currently knowledge is paste-text-only.
- **Embeddings/RAG** — right now we feed *all* knowledge base entries into every reply prompt. Fine for ~50 entries. Past that, switch to vector search (Supabase has `pgvector`).
- **Analytics dashboard charts** — only counts are shown.
- **Team seats** — every user is solo.
- **Direct Meta Graph API integration** (eliminating ManyChat) — requires Meta App Review (2–6 weeks). Skip for v1.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Cannot find module '@supabase/ssr'` | Run `npm install` again |
| Webhook returns 401 | The `x-manychat-secret` header doesn't match `MANYCHAT_WEBHOOK_SECRET` |
| Webhook returns 400 with `bad_request` | Your ManyChat JSON body is missing a field. Check the body shape in section 5c |
| Stripe checkout 500s | `STRIPE_PRICE_ID` is wrong or you mixed test/live keys |
| Login works but `/dashboard` redirects to `/login` | Cookies aren't being set — check middleware, restart `npm run dev` |
| AI reply is generic | You haven't added knowledge base entries for that chatbot |
| RLS errors on inserts | The current user isn't logged in, or you're querying a chatbot you don't own |
