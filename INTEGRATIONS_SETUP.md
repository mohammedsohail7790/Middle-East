# Halla AI — Integrations Setup Guide

> Every integration in this codebase: what it does, what env vars it needs,
> where to get credentials, and the exact redirect URIs to register.
>
> **Gateway:** `https://gateway.hallaai.com`  
> **Dashboard:** `https://app.hallaai.com`  
> **Market:** GCC / Middle East

---

## How the voice pipeline works

```
Caller ──► Twilio (PSTN) ──► Gateway WebSocket
                                      │
                          ┌───────────▼───────────┐
                          │  OpenAI Realtime API  │
                          │  (single WSS session) │
                          │                       │
                          │  ✓ STT  (built-in)    │
                          │  ✓ LLM  (built-in)    │
                          │  ✓ TTS  (built-in)    │
                          └───────────────────────┘
```

**One API key handles everything.** The gateway connects to
`wss://api.openai.com/v1/realtime` on each inbound call. OpenAI's Realtime API
does speech-to-text, runs the conversation model, and streams audio back — no
separate STT or TTS provider needed.

| Service | Used in calls? | Notes |
|---------|---------------|-------|
| **OpenAI** | ✅ Yes — required | STT + LLM + TTS via Realtime API |
| Deepgram | ❌ No | Was in old pre-launch validator. Removed. Not in call path. |
| ElevenLabs | ❌ No | Only used by the **Enterprise voice-cloning** feature (optional) |

---

## Table of Contents

1. [Telephony — Twilio](#1-telephony--twilio)
2. [AI / Voice — OpenAI Realtime API](#2-ai--voice--openai-realtime-api)
3. [Database — Supabase](#3-database--supabase)
4. [Cache / Queues — Redis](#4-cache--queues--redis)
5. [Payments — Stripe](#5-payments--stripe)
6. [Calendar — Google Calendar](#6-calendar--google-calendar)
7. [Calendar — Microsoft Outlook](#7-calendar--microsoft-outlook)
8. [Calendar — Calendly](#8-calendar--calendly)
9. [Calendar — Acuity Scheduling](#9-calendar--acuity-scheduling)
10. [CRM — HubSpot](#10-crm--hubspot)
11. [CRM — Salesforce](#11-crm--salesforce)
12. [CRM — Pipedrive](#12-crm--pipedrive)
13. [CRM — Zoho CRM](#13-crm--zoho-crm)  ← GCC popular
14. [CRM — Freshsales](#14-crm--freshsales)  ← GCC popular
15. [Field Service — Jobber](#15-field-service--jobber)
16. [Messaging — Slack](#16-messaging--slack)
17. [Automation — Zapier Webhooks](#17-automation--zapier-webhooks)
18. [Channels — WhatsApp Business (META)](#18-channels--whatsapp-business-meta)  ← GCC primary
19. [Channels — Web Chat](#19-channels--web-chat)
20. [Channels — Instagram / Facebook](#20-channels--instagram--facebook)
21. [Email — SMTP / Resend / SendGrid](#21-email--smtp--resend--sendgrid)
22. [Monitoring — Sentry](#22-monitoring--sentry)
23. [Internal Auth Keys](#23-internal-auth-keys)
24. [Voice Cloning — ElevenLabs (Enterprise only, optional)](#24-voice-cloning--elevenlabs-enterprise-only-optional)

---

## 1. Telephony — Twilio

**What it does:** Receives inbound calls, streams audio to the gateway over WebSocket, sends SMS confirmations.

**Console:** https://console.twilio.com

**Steps:**
1. Create or log in to a Twilio account.
2. Buy a phone number for the target country:
   - KSA → `+966` ← primary market
   - UAE → `+971`
   - Qatar → `+974`
   - Bahrain → `+973`
   - Kuwait → `+965`
3. On the number → **Voice Configuration → A call comes in:**
   - Webhook: `https://gateway.hallaai.com/api/v1/voice/incoming-call`
   - Method: `HTTP POST`
4. **Account → API keys & tokens** → copy Account SID and Auth Token.
5. Set `TWILIO_STREAM_WSS_URL` to the gateway WSS address below.
6. **When you change your Twilio number**, just update `TWILIO_PHONE_NUMBER` in your env and redeploy — no other changes needed.

**Env vars:**
```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# Change this to whatever number you buy — +966 KSA, +971 UAE, etc.
TWILIO_PHONE_NUMBER=+966xxxxxxxxx
TWILIO_STREAM_WSS_URL=wss://gateway.hallaai.com
```

> One phone number per tenant. Tenants buy and manage numbers from the dashboard
> → `/dashboard/phone-numbers`.

---

## 2. AI / Voice — OpenAI Realtime API

**What it does:** The entire live call brain — speech recognition, conversation, and voice response — in one persistent WebSocket session.

**Console:** https://platform.openai.com/api-keys

**Steps:**
1. Create an API key.
2. Confirm your account has **Realtime API** access: https://platform.openai.com/playground/realtime
3. The gateway opens `wss://api.openai.com/v1/realtime?model=gpt-realtime` automatically on each call. No extra setup.

**Built-in voices (set per tenant in the dashboard):**

| Voice | Character |
|-------|-----------|
| `marin` | Default — warm, professional |
| `alloy` | Neutral, clear |
| `ash` | Confident, direct |
| `coral` | Friendly, bright |
| `echo` | Smooth, measured |
| `nova` | Energetic, conversational |
| `sage` | Calm, authoritative |
| `shimmer` | Warm, expressive |
| `onyx` | Deep, formal |
| `ballad` `fable` `verse` `cedar` | Stylised options |

**Env vars:**
```env
OPENAI_API_KEY=sk-proj-xxxxxxxx   # ← same key you already have, no new account needed

# Optional — defaults shown
OPENAI_REALTIME_MODEL=gpt-realtime
OPENAI_TIMEOUT_MS=5000
VOICE_MAX_TOKENS_PER_CALL=3000

# Used for knowledge-base embedding (runs at index time, not during calls)
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_EMBEDDING_TIMEOUT_MS=15000
```

**Supported languages** (defined in `plan-config.ts` — these are the only 4):

| Code | Language | Available on |
|------|----------|--------------|
| `ar-SA` | Arabic (Saudi) | All plans — **default** |
| `en` | English | All plans |
| `hi` | Hindi | Professional, Trial, Enterprise |
| `ru` | Russian | Professional, Trial, Enterprise |

OpenAI Realtime handles all four natively. The gateway passes the tenant's
`default_language` (`ar-SA` for GCC) in every session config — tenants can
switch their language from the Agent settings page in the dashboard.

---

## 3. Database — Supabase

**What it does:** Primary PostgreSQL database, user authentication, row-level security, realtime subscriptions.

**Console:** https://supabase.com/dashboard

**Steps:**
1. Create a project. Pick the nearest region (London `eu-west-2` is closest for GCC until a UAE region opens).
2. **Settings → API:**
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`
3. **Settings → Database → Connection string → URI → Pooler (port 6543):**
   - This is your `DATABASE_URL` and `GATEWAY_DATABASE_URL`
4. Run migrations in order via the **SQL Editor:**
   ```
   supabase/schema.sql
   supabase/migrations/001_...sql  through  065_halla_ai_me_localisation.sql
   ```
5. (Optional) Seed a demo GCC tenant:
   ```sql
   -- supabase/seed_demo_tenant.sql
   -- Creates: Halla AI Demo Business, +97145551234, Asia/Dubai, AED, Arabic
   ```
6. **Authentication → URL Configuration:**
   - Site URL: `https://app.hallaai.com`
   - Redirect URLs:
     ```
     https://app.hallaai.com/auth/callback
     http://localhost:3000/auth/callback
     https://*.vercel.app/auth/callback
     ```

**Env vars:**
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DATABASE_URL=postgresql://postgres.xxxx:[PASSWORD]@aws-0-eu-west-2.pooler.supabase.com:6543/postgres?sslmode=require
GATEWAY_DATABASE_URL=postgresql://postgres.xxxx:[PASSWORD]@aws-0-eu-west-2.pooler.supabase.com:6543/postgres?sslmode=require
PGSSLMODE=require
```

---

## 4. Cache / Queues — Redis

**What it does:** Session cache, rate limiting, BullMQ job queues for background workers, SSE pub/sub.

**Options:**
- **Render Redis** — auto-provisioned by `render.yaml` as `halla-ai-redis`, `noeviction` policy. No manual setup needed.
- **Upstash** — serverless Redis, good for low traffic: https://upstash.com
- **Redis Cloud** — https://redis.com

**Env vars:**
```env
REDIS_URL=redis://default:[PASSWORD]@[HOST]:[PORT]
```

On Render, `REDIS_URL` is injected automatically from the `halla-ai-redis` service.

---

## 5. Payments — Stripe

**What it does:** Subscription billing (Essential / Professional / Enterprise plans) and per-minute overage metering.

**Console:** https://dashboard.stripe.com

**Steps:**

**1. Create products and prices** — one product per plan, two prices each (monthly + annual), plus one overage metered price:

| Plan | Env var (monthly price) | Env var (annual price) | Env var (overage) |
|------|------------------------|----------------------|-------------------|
| Essential | `STRIPE_ESSENTIAL_PRICE_ID` | `STRIPE_ESSENTIAL_ANNUAL_PRICE_ID` | `STRIPE_ESSENTIAL_OVERAGE_ID` |
| Professional | `STRIPE_PROFESSIONAL_PRICE_ID` | `STRIPE_PROFESSIONAL_ANNUAL_PRICE_ID` | `STRIPE_PROFESSIONAL_OVERAGE_ID` |
| Enterprise | `STRIPE_ENTERPRISE_PRICE_ID` | `STRIPE_ENTERPRISE_ANNUAL_PRICE_ID` | `STRIPE_ENTERPRISE_OVERAGE_ID` |

**2. Create a webhook endpoint:**
- URL: `https://gateway.hallaai.com/api/v1/billing/webhook`
- Events:
  ```
  customer.subscription.created
  customer.subscription.updated
  customer.subscription.deleted
  invoice.payment_succeeded
  invoice.payment_failed
  payment_intent.succeeded
  ```
- Copy **Signing secret** → `STRIPE_WEBHOOK_SECRET`

**3.** Copy **Secret key** → `STRIPE_SECRET_KEY`

**Env vars:**
```env
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx

# Price IDs
STRIPE_ESSENTIAL_PRICE_ID=price_xxxx
STRIPE_ESSENTIAL_ANNUAL_PRICE_ID=price_xxxx
STRIPE_ESSENTIAL_OVERAGE_ID=price_xxxx
STRIPE_PROFESSIONAL_PRICE_ID=price_xxxx
STRIPE_PROFESSIONAL_ANNUAL_PRICE_ID=price_xxxx
STRIPE_PROFESSIONAL_OVERAGE_ID=price_xxxx
STRIPE_ENTERPRISE_PRICE_ID=price_xxxx
STRIPE_ENTERPRISE_ANNUAL_PRICE_ID=price_xxxx
STRIPE_ENTERPRISE_OVERAGE_ID=price_xxxx

# Product IDs
STRIPE_ESSENTIAL_PRODUCT_ID_MONTHLY=prod_xxxx
STRIPE_ESSENTIAL_PRODUCT_ID_ANNUAL=prod_xxxx
STRIPE_PROFESSIONAL_PRODUCT_ID_MONTHLY=prod_xxxx
STRIPE_PROFESSIONAL_PRODUCT_ID_ANNUAL=prod_xxxx
STRIPE_ENTERPRISE_PRODUCT_ID_MONTHLY=prod_xxxx
STRIPE_ENTERPRISE_PRODUCT_ID_ANNUAL=prod_xxxx
```

> Use `sk_test_` keys during development. Set currency to `aed` when creating
> GCC plans in Stripe.

---

## OAuth Keys — How All Integrations Work

You don't need to configure every integration upfront. Each one is **per-tenant opt-in** — tenants connect from the dashboard → Integrations page. You only need the platform-level OAuth app credentials so the "Connect" buttons show up.

**Pattern is the same for every integration:**
1. Create an OAuth app in the provider's developer console (5 minutes)
2. Set the redirect URI to `https://gateway.hallaai.com/api/v1/...` (shown in each section)
3. Add the `CLIENT_ID` + `CLIENT_SECRET` to your env or Render dashboard
4. Done — the gateway handles the OAuth flow, token storage, and refresh automatically

You can add OAuth keys at any time. Leaving a key blank just means that integration won't show as available for tenants.

---

## 6. Calendar — Google Calendar

**What it does:** Syncs appointments booked by the AI directly into the tenant's Google Calendar.

**Console:** https://console.cloud.google.com

**Steps:**
1. Create (or select) a project.
2. Enable the **Google Calendar API**.
3. **Credentials → Create OAuth 2.0 Client ID** → Web application.
4. Add redirect URI:
   ```
   https://gateway.hallaai.com/api/v1/calendar/google/callback
   ```
5. Copy **Client ID** and **Client Secret**.

**Env vars:**
```env
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxx
GOOGLE_REDIRECT_URI=https://gateway.hallaai.com/api/v1/calendar/google/callback
```

> Tenant tokens are stored in `voice_tenants.google_access_token` / `google_refresh_token`.

---

## 7. Calendar — Microsoft Outlook

**What it does:** Syncs appointments into the tenant's Outlook / Microsoft 365 calendar.

**Console:** https://portal.azure.com → App registrations

**Steps:**
1. **New registration** → Supported account types: *Accounts in any organizational directory and personal Microsoft accounts*.
2. **Authentication → Add a platform → Web** → Redirect URI:
   ```
   https://gateway.hallaai.com/api/v1/calendar/outlook/callback
   ```
3. **Certificates & secrets → New client secret** → copy the value.
4. Copy **Application (client) ID**.

**Env vars:**
```env
MS_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
MS_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxx
MS_TENANT_ID=common
MS_REDIRECT_URI=https://gateway.hallaai.com/api/v1/calendar/outlook/callback
```

---

## 8. Calendar — Calendly

**What it does:** Books appointments via the tenant's Calendly event types.

**Console:** https://developer.calendly.com

**Steps:**
1. Create an OAuth app → Redirect URI:
   ```
   https://gateway.hallaai.com/api/v1/calendar/calendly/callback
   ```
2. Copy **Client ID** and **Client Secret**.

**Env vars:**
```env
CALENDLY_CLIENT_ID=xxxxxxxxxxxxxxxxxxxx
CALENDLY_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxx
CALENDLY_REDIRECT_URI=https://gateway.hallaai.com/api/v1/calendar/calendly/callback
```

---

## 9. Calendar — Acuity Scheduling

**What it does:** Books appointments via the tenant's Acuity account.

**Console:** https://developers.acuityscheduling.com

**Steps:**
1. Create an OAuth app → Redirect URI:
   ```
   https://gateway.hallaai.com/api/v1/calendar/acuity/callback
   ```
2. Copy **Client ID** and **Client Secret**.

**Env vars:**
```env
ACUITY_CLIENT_ID=xxxxxxxxxxxxxxxxxxxx
ACUITY_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxx
ACUITY_REDIRECT_URI=https://gateway.hallaai.com/api/v1/calendar/acuity/callback
```

---

## 10. CRM — HubSpot

**What it does:** Pushes leads, contacts, and deals into HubSpot after each call.

**Console:** https://app.hubspot.com/developer

**Steps:**
1. Create a **public app**.
2. **Auth → Redirect URL:**
   ```
   https://gateway.hallaai.com/api/v1/integrations/hubspot/callback
   ```
3. **Required scopes:**
   ```
   crm.objects.contacts.read
   crm.objects.contacts.write
   crm.objects.deals.read
   crm.objects.deals.write
   crm.objects.contracts.read
   ```
4. **Optional scopes:** `crm.objects.notes.write`
5. Copy **Client ID** and **Client Secret**.

**Env vars:**
```env
HUBSPOT_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
HUBSPOT_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
HUBSPOT_REDIRECT_URI=https://gateway.hallaai.com/api/v1/integrations/hubspot/callback
HUBSPOT_OAUTH_SCOPES=crm.objects.contacts.read crm.objects.contacts.write crm.objects.deals.read crm.objects.deals.write crm.objects.contracts.read
HUBSPOT_OAUTH_OPTIONAL_SCOPES=crm.objects.notes.write
```

---

## 11. CRM — Salesforce

**What it does:** Syncs leads and contacts to the tenant's Salesforce org.

**Console:** https://developer.salesforce.com → Connected Apps

**Steps:**
1. **Setup → App Manager → New Connected App**.
2. Enable **OAuth Settings** → Callback URL:
   ```
   https://gateway.hallaai.com/api/v1/integrations/salesforce/callback
   ```
3. Scopes: `api`, `refresh_token`.
4. Copy **Consumer Key** (Client ID) and **Consumer Secret**.

**Env vars:**
```env
SALESFORCE_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SALESFORCE_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 12. CRM — Pipedrive

**What it does:** Pushes leads and deals to Pipedrive after calls.

**Console:** https://developers.pipedrive.com

**Steps:**
1. Create a new app → OAuth redirect URL:
   ```
   https://gateway.hallaai.com/api/v1/integrations/pipedrive/callback
   ```
2. Copy **Client ID** and **Client Secret**.

**Env vars:**
```env
PIPEDRIVE_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PIPEDRIVE_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 13. CRM — Zoho CRM

**What it does:** Syncs call leads to Zoho CRM. Widely used across the GCC market.

**Console:** https://api-console.zoho.com

**Steps:**
1. Create a **Server-based Application** OAuth app.
2. Authorized Redirect URI:
   ```
   https://gateway.hallaai.com/api/v1/integrations/zoho/callback
   ```
3. Scopes: `ZohoCRM.modules.leads.CREATE`, `ZohoCRM.modules.contacts.CREATE`
4. Copy **Client ID** and **Client Secret**.
5. For GCC, use the `.com` or `.eu` data center.

**Env vars:**
```env
ZOHO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ZOHO_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ZOHO_REDIRECT_URI=https://gateway.hallaai.com/api/v1/integrations/zoho/callback
ZOHO_DC=com
```

> **Status:** Env vars and redirect URI wired. Service implementation is a stub — ready to build out.

---

## 14. CRM — Freshsales

**What it does:** Syncs call leads to Freshsales (Freshworks CRM). Very popular in MENA / GCC.

**Console:** https://developer.freshworks.com/crm/api/

**Steps:**
1. Freshsales Settings → **Marketplace → Custom Apps → Create App**.
2. OAuth Redirect URL:
   ```
   https://gateway.hallaai.com/api/v1/integrations/freshsales/callback
   ```
3. Scopes:
   ```
   freshsales.contacts.create
   freshsales.contacts.upsert
   freshsales.contacts.filters.view
   freshsales.selectors.view
   ```
4. Copy **App ID** and **App Secret**.

**Env vars:**
```env
FRESHSALES_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
FRESHSALES_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
FRESHSALES_REDIRECT_URI=https://gateway.hallaai.com/api/v1/integrations/freshsales/callback
FRESHSALES_OAUTH_SCOPES=freshsales.contacts.create freshsales.contacts.upsert freshsales.contacts.filters.view freshsales.selectors.view
```

> **Status:** Env vars and scopes wired. Service implementation is a stub.

---

## 15. Field Service — Jobber

**What it does:** Books jobs and syncs customers for field service businesses (HVAC, plumbing, cleaning).

**Console:** https://developer.getjobber.com

**Steps:**
1. Create an app → Redirect URI:
   ```
   https://gateway.hallaai.com/api/v1/integrations/jobber/callback
   ```
2. Copy **Client ID** and **Client Secret**.
3. Use the latest stable API version (`2025-04-16`).

**Env vars:**
```env
JOBBER_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
JOBBER_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
JOBBER_REDIRECT_URI=https://gateway.hallaai.com/api/v1/integrations/jobber/callback
JOBBER_API_VERSION=2025-04-16
```

---

## 16. Messaging — Slack

**What it does:** Posts a call summary to a Slack channel after each call ends — caller name, service, lead quality, dashboard link.

**Console:** https://api.slack.com/apps

**Steps:**
1. Create a Slack App → **OAuth & Permissions → Redirect URLs:**
   ```
   https://gateway.hallaai.com/api/v1/integrations/slack/callback
   ```
2. Bot Token Scopes: `chat:write`, `chat:write.public`, `channels:read`, `incoming-webhook`.
3. Copy **Client ID** and **Client Secret** from **Basic Information**.

**Env vars:**
```env
SLACK_CLIENT_ID=xxxxxxxxxxxx.xxxxxxxxxxxx
SLACK_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SLACK_REDIRECT_URI=https://gateway.hallaai.com/api/v1/integrations/slack/callback
```

---

## 17. Automation — Zapier Webhooks

**What it does:** Sends call data (name, phone, service, summary) to any Zapier zap via a webhook URL — giving tenants access to 6,000+ apps without code.

**Setup:** No app registration at the platform level.

**Per-tenant steps:**
1. In Zapier → New Zap → Trigger: **Webhooks by Zapier → Catch Hook**.
2. Copy the generated webhook URL.
3. Tenant pastes it in the dashboard → **Settings → Integrations → Zapier**.
4. Stored per-tenant in `voice_tenants.zapier_webhook_url`.

**Env vars:** None needed at the platform level.

---

## 18. Channels — WhatsApp Business (META)

**What it does:** Inbound and outbound WhatsApp messaging — the dominant customer contact channel across the GCC.

**Console:** https://developers.facebook.com → WhatsApp → Getting Started

**Steps:**
1. Create a **Meta Business Account** if needed.
2. **Meta for Developers → My Apps → Create App** → Business type.
3. Add the **WhatsApp** product.
4. Add a phone number under **Phone Numbers**.
5. **Webhooks → Configure:**
   - Callback URL: `https://gateway.hallaai.com/api/v1/channels/whatsapp/webhook`
   - Verify Token: set any random string → use the same value as `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
   - Subscribe to: `messages`
6. Copy:
   - **WhatsApp Business Account ID** → `WHATSAPP_BUSINESS_ACCOUNT_ID`
   - **Phone Number ID** → `WHATSAPP_PHONE_NUMBER_ID`
   - **System User access token** (permanent, not the temporary one) → `WHATSAPP_ACCESS_TOKEN`

**Env vars:**
```env
WHATSAPP_BUSINESS_ACCOUNT_ID=xxxxxxxxxxxxxxxxxxxx
WHATSAPP_ACCESS_TOKEN=EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
WHATSAPP_PHONE_NUMBER_ID=xxxxxxxxxxxxxxxxxxxx
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your-random-verify-token
```

> **Database:** Each tenant's connection stored in `public.whatsapp_connections` (migration 065).  
> **Status:** Schema ready. Webhook route stub at `POST /api/v1/channels/whatsapp/webhook`.

---

## 19. Channels — Web Chat

**What it does:** Embeddable chat widget for the tenant's website — same AI agent as the voice channel.

**Setup:** No external credentials. Tenant gets a `<script>` embed snippet from the dashboard.

> **Status:** Channel connection schema ready (`channel_connections`, `web_chat`). Widget implementation TBD.

---

## 20. Channels — Instagram / Facebook

**What it does:** Receive and respond to Instagram DMs and Facebook Messenger messages via the AI agent.

**Console:** https://developers.facebook.com

**Steps:**
1. Same Meta App as WhatsApp → add the **Messenger** product.
2. **Webhooks → Subscribe** to `messages`, `messaging_postbacks`.
3. Callback URLs:
   ```
   https://gateway.hallaai.com/api/v1/channels/instagram/webhook
   https://gateway.hallaai.com/api/v1/channels/facebook/webhook
   ```

**Env vars:**
```env
META_APP_ID=xxxxxxxxxxxxxxxxxxxx
META_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
META_PAGE_ACCESS_TOKEN=EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> **Status:** Channel connection schema ready. Handler stub — implementation TBD.

---

## 21. Email — SMTP / Resend / SendGrid

**What it does:** Transactional emails — call summaries, lead notifications, appointment confirmations, auth emails.

**Option A — Resend (recommended, simple):**
1. https://resend.com → create API key.
2. Add and verify `hallaai.com` domain.

**Option B — SendGrid:**
1. https://sendgrid.com → **Settings → API Keys → Create API Key** → Full Access.
2. Verify sender domain `hallaai.com`.

**Env vars:**
```env
# Option A — Resend
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=hello@hallaai.com

# Option B — SMTP (SendGrid, Mailgun, etc.)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=hello@hallaai.com
```

---

## 22. Monitoring — Sentry

**What it does:** Error tracking and performance monitoring for the gateway and dashboard.

**Console:** https://sentry.io

**Steps:**
1. Create project → **Node.js** (gateway).
2. Create second project → **Next.js** (dashboard).
3. Copy DSN from each.

**Env vars:**
```env
SENTRY_DSN=https://xxxx@xxxx.ingest.sentry.io/xxxx
SENTRY_ENVIRONMENT=production
```

---

## 23. Internal Auth Keys

Generated randomly — not tied to any external service.

```powershell
# PowerShell
[System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```
```bash
# Linux / Mac
openssl rand -base64 48
```

**Env vars:**
```env
JWT_SECRET=<64-char random string>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

VOICE_INTERNAL_API_KEY=<64-char random string>
INTERNAL_API_KEY=<64-char random string>
ADMIN_API_KEY=<64-char random string>
```

---

## 24. Voice Cloning — ElevenLabs (Enterprise only, optional)

**What it does:** Lets Enterprise tenants upload voice samples to clone a custom voice.
The cloned voice ID is stored in the DB and mapped to the closest OpenAI built-in
voice for actual call delivery.

**This is not in the live call path.** See `apps/gateway/src/services/voice-cloning/voiceCloning.service.ts`.

**Console:** https://elevenlabs.io/api

**Steps:**
1. Create an account → **Profile → API Key** → copy.
2. Only configure if you offer the voice-cloning feature to Enterprise tenants.

**Env vars:**
```env
ELEVENLABS_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Can be omitted entirely if voice cloning is not offered.

---

## Summary Table

| Integration | Status | Category | Env vars | Signup |
|-------------|--------|----------|----------|--------|
| **Twilio** | ✅ Live | Telephony | 4 | https://twilio.com |
| **OpenAI Realtime API** | ✅ Live | AI + STT + TTS | 1 required | https://platform.openai.com |
| **Supabase** | ✅ Live | Database + Auth | 5 | https://supabase.com |
| **Redis** | ✅ Live | Cache + Queues | 1 | Render auto / Upstash |
| **Stripe** | ✅ Live | Billing | 11+ | https://stripe.com |
| Google Calendar | ✅ Live | Calendar | 3 | https://console.cloud.google.com |
| Microsoft Outlook | ✅ Live | Calendar | 4 | https://portal.azure.com |
| Calendly | ✅ Live | Calendar | 3 | https://developer.calendly.com |
| Acuity Scheduling | ✅ Live | Calendar | 3 | https://acuityscheduling.com |
| HubSpot | ✅ Live | CRM | 5 | https://app.hubspot.com/developer |
| Salesforce | ✅ Live | CRM | 2 | https://developer.salesforce.com |
| Pipedrive | ✅ Live | CRM | 2 | https://developers.pipedrive.com |
| Zoho CRM | 🔧 Stub | CRM | 3 | https://api-console.zoho.com |
| Freshsales | 🔧 Stub | CRM | 4 | https://developer.freshworks.com |
| Jobber | ✅ Live | Field service | 4 | https://developer.getjobber.com |
| Slack | ✅ Live | Messaging | 3 | https://api.slack.com/apps |
| Zapier | ✅ Live | Automation | 0 (per-tenant) | https://zapier.com |
| WhatsApp Business | 🔧 Schema ready | Channel | 4 | https://developers.facebook.com |
| Web Chat | 🔧 Schema ready | Channel | 0 | None |
| Instagram / Facebook | 🔧 Stub | Channel | 3 | https://developers.facebook.com |
| Resend / SendGrid | ✅ Live | Email | 2–4 | https://resend.com |
| Sentry | ✅ Live | Monitoring | 2 | https://sentry.io |
| ElevenLabs | 🔧 Optional | Voice cloning | 1 | https://elevenlabs.io |
| ~~Deepgram~~ | ❌ Removed | Not in call path | — | — |

**Legend:**
- ✅ Live — fully wired, in production use
- 🔧 — env vars / schema ready, service is a stub or optional feature
- ❌ — removed / not applicable

---

## Minimal setup to go live (GCC)

The absolute minimum to receive and handle a real call end-to-end:

```env
# Voice pipeline — 2 services, that's it
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# Buy your number from Twilio console and put it here — change anytime
TWILIO_PHONE_NUMBER=+966xxxxxxxxx    # or +971, +974, etc.
TWILIO_STREAM_WSS_URL=wss://gateway.hallaai.com

# Same OpenAI key you already have — handles STT + LLM + TTS
OPENAI_API_KEY=sk-proj-xxxxxxxx

# Database
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DATABASE_URL=postgresql://...
GATEWAY_DATABASE_URL=postgresql://...
PGSSLMODE=require

# Cache
REDIS_URL=redis://...

# Billing (can use test keys during dev)
STRIPE_SECRET_KEY=sk_test_xxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxx

# Security
JWT_SECRET=<random 64 chars>
VOICE_INTERNAL_API_KEY=<random 64 chars>
ADMIN_API_KEY=<random 64 chars>

# GCC localisation — 4 supported languages
DEFAULT_TIMEZONE=Asia/Dubai
DEFAULT_CURRENCY=AED
DEFAULT_LANGUAGE=ar-SA    # Saudi Arabic default; tenants can switch to en, hi, ru
```

Everything else (CRM, calendar, WhatsApp, Slack, email) is per-tenant and optional — tenants connect them from the dashboard.
