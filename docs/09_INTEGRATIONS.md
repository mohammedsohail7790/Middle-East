# 09 — INTEGRATIONS

## Integration Architecture

**File:** `apps/gateway/src/services/integrations/integration.service.ts`

Integrations use **BullMQ** for async job processing:
- Call completes → job queued → worker processes → CRM/webhook delivery
- Retry with exponential backoff on failure
- Integration logs stored in `integration_logs` table

## Twilio (Telephony)

**Status:** Production-ready  
**Files:** `services/voice/voice.websocket.ts`, `services/voice/voice.controller.ts`

| Feature | Implementation |
|---------|---------------|
| Inbound calls | Webhook → TwiML → Media Stream |
| Media Streams | WebSocket (g711_ulaw audio) |
| Phone provisioning | `services/phone-provisioning/` |
| SMS | `services/sms/sms.service.ts` |
| Call transfer | TwiML `<Dial>` verb |
| Status callbacks | POST to `/webhooks/twilio/status` |

**Env vars:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`

## OpenAI (AI Engine)

**Status:** Production-ready  
**Files:** `services/realtime/realtime.session.ts`, `services/voice/ai.service.ts`

| Feature | Implementation |
|---------|---------------|
| Realtime API | WebSocket to `wss://api.openai.com/v1/realtime` |
| Text completions | `gpt-4o-mini` for non-realtime tasks |
| Embeddings | `text-embedding-3-small` for knowledge base |
| Function calling | Tools defined in `realtime.tools.ts` |

**Env vars:** `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_EMBEDDING_MODEL`

## Stripe (Billing)

**Status:** Production-ready  
**Files:** `services/billing/billing.service.ts`, `services/billing/billing.controller.ts`

| Feature | Implementation |
|---------|---------------|
| Subscriptions | Create, update, cancel |
| Webhooks | Signature verification, event processing |
| Payment intents | For one-time charges |
| Invoices | Retrieved from Stripe API |
| Overage billing | Metered usage reporting |

**Env vars:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_*_PRICE_ID`

## Google Calendar

**Status:** Implemented  
**Files:** `services/calendar/google.calendar.service.ts`

| Feature | Implementation |
|---------|---------------|
| OAuth flow | Authorization code → access/refresh tokens |
| Event creation | Book appointments during calls |
| Availability check | Query free/busy for scheduling |
| Token refresh | Automatic refresh on expiry |

**Env vars:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`  
**Storage:** `voice_tenants.google_access_token`, `google_refresh_token`, `google_calendar_id`

## Outlook Calendar

**Status:** Implemented  
**Files:** `services/calendar/outlook.calendar.service.ts`

Uses Microsoft Graph API via `@azure/msal-node` and `@microsoft/microsoft-graph-client`.

## Calendly / Acuity

**Status:** Implemented  
**Files:** `services/calendar/calendly.service.ts`, `services/calendar/acuity.service.ts`

Basic booking link integration for Essential plan.

## CRM Integrations

### ServiceTitan
**Storage:** `voice_tenants.servicetitan_enabled`, `servicetitan_api_key`, `servicetitan_tenant_id`  
**Delivery:** Lead data pushed via API after call

### Jobber
**Storage:** `voice_tenants.jobber_enabled`, `jobber_api_token`, `jobber_account_id`  
**Delivery:** Lead/appointment data via API

### HouseCallPro
**Storage:** `voice_tenants.housecallpro_enabled`, `housecallpro_api_key`  
**Delivery:** Lead data via API

### Salesforce
**Storage:** `voice_tenants.salesforce_enabled`, `salesforce_instance_url`, `salesforce_access_token`  
**Delivery:** Contact/Lead creation via REST API

### HubSpot
**Storage:** `voice_tenants.hubspot_enabled`, `hubspot_api_key`, `hubspot_portal_id`  
**Delivery:** Contact creation via HubSpot API

## Zapier

**Storage:** `voice_tenants.zapier_webhook_url`  
**Delivery:** POST to webhook URL with call/lead data after each call  
**Format:** JSON payload with call details, lead info, appointment data

## Slack

**Status:** Implemented  
**Files:** `services/slack/slack.service.ts`, `services/slack/slack.controller.ts`

| Feature | Implementation |
|---------|---------------|
| Incoming webhooks | Post alerts to Slack channels |
| Call notifications | New call, missed call, appointment booked |
| System alerts | Error rate, latency, incidents |

**Env vars:** `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`

## SMTP (Email)

**Status:** Implemented  
**Files:** Uses `nodemailer` package

| Feature | Implementation |
|---------|---------------|
| Call summaries | Email after each call |
| Appointment confirmations | Email to customer |
| Trial warnings | Usage alerts |
| Scheduled reports | Automated email reports |

**Env vars:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`

## Custom Webhooks

**Status:** Implemented (Enterprise)  
**Files:** `services/webhooks/webhooks.service.ts`

| Feature | Implementation |
|---------|---------------|
| User-defined endpoints | Stored in `custom_webhooks` table |
| Event filtering | Subscribe to specific events |
| HMAC signing | Secret-based payload verification |
| Delivery logging | `webhook_deliveries` table |
| Retry on failure | Exponential backoff, failure counting |

## Redis (Upstash)

**Status:** Production-ready  
**Files:** `services/cache.ts`, `services/voice/redis.client.ts`

| Usage | Purpose |
|-------|---------|
| Usage counters | Fast minute tracking |
| Tenant config cache | Avoid DB reads per call |
| Knowledge query cache | Avoid embedding re-computation |
| Rate limiting state | IP/tenant counters |
| Concurrency tracking | Active call counts |
| BullMQ job queue | Integration job processing |

## Supabase

**Status:** Production-ready

| Feature | Usage |
|---------|-------|
| PostgreSQL | Primary database |
| pgvector | Knowledge base embeddings |
| Auth | User authentication |
| RLS | Tenant isolation |
| Realtime | WebSocket subscriptions (messages, conversations) |

## Integration Queue (BullMQ)

**File:** `services/integrations/integration.service.ts`

- Worker starts on boot (`integrationService.startWorkerOnBoot()`)
- Processes queued integration jobs (CRM delivery, webhook dispatch)
- Configurable timeout: `INTEGRATION_JOB_TIMEOUT_MS` (default 15s)
- Retry with backoff on failure
