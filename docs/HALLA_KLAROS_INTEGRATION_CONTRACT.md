# Halla → Klaros integration contract (verified against the repository)

Every statement below was read from the code on branch `main` (commit `1feb09c1` and later) and is cited by file. Nothing here was
inferred from a deployed system unless it is marked **observed**.

## 1. Endpoints and authentication
| Item | Value |
|---|---|
| Production gateway base URL | `https://halla-ai-gateway.onrender.com` (Render free plan; **observed** `/health` 200, `/ready` ready:true on 2026-10-09) |
| API prefix | `/api/v1` (`apps/gateway/src/routes/register-api-routes.ts`) |
| Tenant API key | `Authorization: Bearer sk_calliq_…` (`security/api-key-scope-policy.ts`, `services/api-keys/apiKey.service.ts`). Keys are issued per tenant through `/api/v1/api-keys`. |
| Tenant identity | Derived from the verified key or Supabase JWT, never from a client header (`services/auth/tenant-context.ts`). |
| Tenant id format | UUID. A tenant is `public.voice_tenants.id`, which equals the organization id created by `POST /api/v1/organizations` (needs a signed-in Supabase user; `services/organizations/organization.service.ts`). |
| Default-deny scopes | A tenant key reaches only routes in `API_KEY_ROUTE_POLICY`. Webhook management needs the dedicated scope `webhooks.manage`; the Klaros workforce contract needs `workforce.read` / `workforce.write`; order status needs `orders.read`. |
| Plan rule for webhooks | `requireProfessionalOrHigher`: the tenant needs an active subscription that is **trialing** or Professional+ (`middleware/plan-gating.ts`). |

Unauthenticated requests were **observed** to return `401 {"success":false,"error":"Unauthorized"}` on `/api/v1/webhooks`,
`/api/v1/leads`, `/api/v1/integrations/klaros/*`.

## 2. Webhook registration
`POST /api/v1/webhooks` (also `GET /`, `PUT /:id`, `DELETE /:id`, `GET /:id/deliveries`), body:
`{ "name": string, "url": string, "events": string[], "headers"?: object }` (`services/webhooks/webhooks.controller.ts`).
- `events` must all be in `KLAROS_EVENT_TYPES`; any unknown name is rejected (`security/klaros-event-types.ts`).
- `url` must be HTTPS and pass the SSRF guard (`security/ssrf-guard.ts`): literal-host rules and every resolved address are
  checked at registration **and again on every delivery**. Redirects are never followed.
- The response contains the signing secret **once** (32 random bytes, 64 hex chars). Later reads omit it. Store it in the receiver
  encrypted; Klaros must not log it.
- Callback URL for the Klaros pilot: `https://klaros-halla-pilot.onrender.com/api/v1/webhooks/halla/{klaros_tenant_id}`.
  **Observed** (2026-10-09): `GET /health` 200 `{"status":"ok","env":"production"}`; an unsigned POST to an unknown tenant id returns 404.
  No production webhook has been registered by this task.

## 3. Events actually emitted
Allowed names: `call.started`, `call.completed`, `lead.created`, `lead.updated`, `lead.qualified`, `lead.escalated`,
`appointment.requested`, `appointment.confirmed`, `appointment.rescheduled`, `appointment.cancelled`.
The bus consumer maps these platform events (`events/consumers/klaros-webhook.consumer.ts`):

| Klaros event | Emitted from |
|---|---|
| `call.started` | `CALL_STARTED` |
| `call.completed` | `CALL_ENDED` |
| `lead.created` / `lead.updated` / `lead.qualified` / `lead.escalated` | `LEAD_CREATED` / `LEAD_UPDATED` / `LEAD_QUALIFIED` / `LEAD_ESCALATED` |
| `appointment.confirmed` | `APPOINTMENT_CREATED` |
| `appointment.rescheduled` / `appointment.cancelled` | `APPOINTMENT_RESCHEDULED` / `APPOINTMENT_CANCELLED` |

**`appointment.requested` is accepted at registration but has no producer**: nothing sends it today.
A finished call delivers `lead.qualified` (id `<eventId>:lead.qualified`, only when a real qualification exists) and then
`call.completed`, as one ordered sequence.

## 4. Envelope and signature
Body (JSON, sent byte-for-byte as signed): `{ "id", "type", "timestamp" (ISO-8601), "tenant_id", "data" }`.
Headers: `Content-Type: application/json`, `X-HallaAI-Timestamp` (Unix **seconds**, string), `X-HallaAI-Signature: sha256=<hex>`,
`User-Agent: HallaAI-Webhooks/1.0`.
Signature: `hex(HMAC_SHA256(secret, "<timestamp>.<raw body>"))` (`security/webhook-signing.ts`). Verification tolerance:
`WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 300` (five minutes either side).
A webhook row with no secret never degrades to an unsigned delivery: it fails closed and is recorded.

**Compatibility with the Klaros receiver** (HMAC-SHA256, `sha256=` prefix, `<timestamp>.<raw body>`, five-minute window):
identical. Evidence: on 2026-10-08 the real Klaros receiver code accepted 11/11 bodies produced by Halla's own consumer and
rejected tampered/wrong-secret/stale requests with 401/403/404 (staging, signed inside the Halla staging database; not the
deployed gateway's sender).

## 5. Idempotency, retries, failure handling
- Idempotency key = event id (stable across retries). `webhook_deliveries` has a unique `(webhook_id, event_id)`; a delivered step is never re-sent.
  Klaros dedupes on `{klaros_tenant}:{event id}` and answers `duplicate_ignored`.
- Delivery is only from the event-bus consumer, in order per webhook; a later step is not sent past a failed earlier one,
  except on the final attempt (so the last step is not blocked forever).
- Non-2xx, timeout (10 s), redirect or network error = failed delivery, recorded with status; the bus retries with exponential backoff,
  `P2_CONSUMER_MAX_RETRIES` (default 5), then moves the event to the dead-letter stream (`infrastructure/events/event-consumer.ts`).
- A permanently blocked destination (SSRF rule) is recorded and not retried; a transient DNS failure is retried.

## 6. What this document does NOT establish
- No production tenant, API key or webhook was inspected or created (no authorized production read in this task).
- The deployed gateway's own sender has not been run against `klaros-halla-pilot` (real delivery over HTTP is unproven for that URL).
- The free Render instance sleeps (about 50 s cold start); a webhook delivery that hits a cold gateway or receiver is retried by the bus.
