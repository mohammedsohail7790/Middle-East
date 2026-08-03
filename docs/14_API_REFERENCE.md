# 14 — API REFERENCE

## Base URL

- **Production:** `https://api.calliq.com` (or Render URL)
- **Local:** `http://localhost:3003`

## Authentication

All `/api/` routes require one of:
- `x-tenant-id` header (tenant-scoped operations)
- `Authorization: Bearer <JWT>` header
- `x-internal-api-key` header (service-to-service)

## Health & System Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/` | None | Service info |
| GET | `/health` | None | Basic health (always 200) |
| GET | `/ready` | None | Readiness (checks DB + Redis) |
| GET | `/voice-health` | None | Voice pipeline preflight status |
| GET | `/stats` | None | System stats |
| GET | `/debug/env` | None | Shows which env vars are set |
| GET | `/debug/twilio` | None | Twilio connection debug |
| GET | `/debug/realtime` | None | Realtime gateway debug |
| GET | `/debug/tenant?phone=+1...` | None | Tenant lookup debug |
| GET | `/debug/audio/:sessionId` | Admin | Audio diagnostics |
| GET | `/health/realtime` | None | Realtime subsystem health |
| GET | `/metrics/production` | Admin | Production telemetry |
| GET | `/metrics/realtime` | Admin | Realtime metrics |
| GET | `/metrics/audio` | Admin | Active audio sessions |
| GET | `/metrics/call/:callId` | Admin | Per-call trace |

## Voice API (`/api/v1/voice`)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/voice/incoming` | Twilio webhook — inbound call TwiML |
| POST | `/voice/status` | Twilio status callback |
| GET | `/voice/config/:tenantId` | Get voice config |

## Calls API (`/api/v1/calls`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/calls` | List calls for tenant |
| GET | `/calls/:id` | Get call details |
| GET | `/calls/:id/transcript` | Get call transcript |

## Leads API (`/api/v1/leads`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/leads` | List leads |
| GET | `/leads/:id` | Get lead details |
| PUT | `/leads/:id` | Update lead |
| DELETE | `/leads/:id` | Delete lead |

## Appointments API (`/api/v1/appointments`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/appointments` | List appointments |
| POST | `/appointments` | Create appointment |
| PUT | `/appointments/:id` | Update appointment |
| DELETE | `/appointments/:id` | Cancel appointment |

## Billing API (`/api/v1/billing`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/billing/plans` | List all plans |
| GET | `/billing/subscription` | Get subscription |
| POST | `/billing/subscription` | Create subscription |
| PUT | `/billing/subscription/plan` | Change plan |
| DELETE | `/billing/subscription` | Cancel |
| GET | `/billing/usage` | Usage + limits |
| POST | `/billing/usage` | Track usage |
| GET | `/billing/overage` | Overage calculation |
| POST | `/billing/feature-check` | Feature access check |
| GET | `/billing/invoices` | Invoice history |
| POST | `/billing/create-payment-intent` | Stripe payment |
| POST | `/billing/webhook` | Stripe webhook |
| GET | `/billing/trial` | Trial status |
| GET | `/billing/plan-config` | Tenant plan config |
| GET | `/billing/plan-definitions` | All plans (public) |

## AI Config API (`/api/v1/ai-config`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/ai-config` | Get AI config |
| PUT | `/ai-config` | Update AI config (plan-validated) |
| GET | `/ai-config/system-prompt` | Generated system prompt |
| POST | `/ai-config/test` | Test with sample input |

## Knowledge Base API (`/api/v1/knowledge`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/knowledge` | List entries |
| POST | `/knowledge` | Ingest text |
| POST | `/knowledge/upload` | Upload file (pdf/docx/txt/csv) |
| POST | `/knowledge/ingest-url` | Scrape website |
| GET | `/knowledge/files` | List uploaded files |
| GET | `/knowledge/files/:id` | File status |
| POST | `/knowledge/files/:id/reprocess` | Reprocess file |
| DELETE | `/knowledge/:id` | Delete entry |
| DELETE | `/knowledge/files/:id` | Delete file |
| GET | `/knowledge/cache/stats` | Cache statistics |

## Integrations API (`/api/v1/integrations`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/integrations` | List integrations |
| POST | `/integrations/connect` | Connect integration |
| DELETE | `/integrations/:id` | Disconnect |
| GET | `/integrations/status` | Integration health |

## Calendar API (`/api/v1/calendar`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/calendar/events` | List events |
| POST | `/calendar/events` | Create event |
| GET | `/calendar/availability` | Check availability |
| POST | `/calendar/connect/google` | Connect Google Calendar |
| POST | `/calendar/connect/outlook` | Connect Outlook |

## Phone Numbers API (`/api/v1/phone-numbers`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/phone-numbers` | List numbers |
| POST | `/phone-numbers/search` | Search available |
| POST | `/phone-numbers/purchase` | Purchase number |
| DELETE | `/phone-numbers/:id` | Release number |

## Dashboard API (`/api/v1/dashboard`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/dashboard/stats` | Dashboard summary |
| GET | `/dashboard/recent-calls` | Recent calls |
| GET | `/dashboard/metrics` | Key metrics |

## Analytics API (`/api/v1/analytics`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/analytics/calls` | Call analytics |
| GET | `/analytics/leads` | Lead analytics |
| GET | `/analytics/performance` | Performance metrics |

## Team API (`/api/v1/team`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/team` | List members |
| POST | `/team/invite` | Invite member |
| PUT | `/team/:id/role` | Update role |
| DELETE | `/team/:id` | Remove member |

## SMS API (`/api/v1/sms`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/sms` | List messages |
| POST | `/sms/send` | Send SMS |

## Enterprise APIs

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/audit-logs` | Audit trail |
| GET/POST/DELETE | `/api/v1/api-keys` | API key management |
| GET/POST/PUT/DELETE | `/api/v1/webhooks` | Custom webhooks |
| GET/POST | `/api/v1/qa` | QA rubrics |
| GET/PUT | `/api/v1/sso` | SSO configuration |
| GET/POST/PUT/DELETE | `/api/v1/ivr` | IVR flows |
| GET/PUT | `/api/v1/retention` | Data retention |
| GET/POST | `/api/v1/reports` | Scheduled reports |
| GET | `/api/v1/msp` | MSP dashboard |
| GET/POST/DELETE | `/api/v1/ip-allowlist` | IP restrictions |
| GET/POST | `/api/v1/voice-cloning` | Voice cloning |
| GET/PUT | `/api/v1/onboarding` | Onboarding progress |
| GET | `/api/v1/cost` | Cost intelligence |

## WebSocket Endpoints

| Path | Protocol | Purpose |
|------|----------|---------|
| `wss://host/ws/voice/:tenantId` | Twilio Media Stream | Voice call audio |
| `wss://host/ws/realtime/:tenantId` | OpenAI Realtime bridge | Dashboard realtime |
| `wss://host/ws/test` | Echo | Connectivity test |

## Rate Limiting

- `/api/` routes: 100 requests per 15 minutes (configurable)
- WebSocket upgrades: Per-IP rate limiting + burst protection
- Per-tenant concurrent calls: 25 (configurable)
- Global concurrent calls: 300 (configurable)

## Response Format

All API responses follow:
```json
{
  "success": true|false,
  "data": { ... },
  "error": "string (if success=false)",
  "message": "string (optional)"
}
```
