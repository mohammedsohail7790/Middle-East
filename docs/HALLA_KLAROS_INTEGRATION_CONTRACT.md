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

### 3.1 Optional consent evidence on `lead.created` / `lead.updated` (proposed for review; local code, not deployed)
`data` may carry one extra key, `consent`, **only when a real consent record exists**. When none exists the key is **absent** (never
`null`, never `{ "granted": false }` as a stand-in). Existing receivers that ignore unknown keys are unaffected.

```json
"consent": {
  "granted": true,
  "scope": ["contact", "store_personal_data"],
  "method": "voice_ai_verbal",
  "wording_version": "<label the business configured>",
  "recorded_at": "2026-10-09T10:00:02.000Z"
}
```

| Field | Meaning |
|---|---|
| `granted` | `true`: at least one scope is currently agreed to; `scope` lists exactly those. `false`: no scope is currently agreed to; `scope` lists the scopes the caller **declined or withdrew**. |
| `scope` | Non-empty array, a subset of `contact`, `store_personal_data`, `store_medical_information`. **Independent**: `contact` does not imply `store_personal_data`; neither implies `store_medical_information`. Never wider than what the caller explicitly answered. |
| `method` | `voice_ai_verbal` (the only value today): the caller answered a spoken question and the AI agent recorded it with the `record_consent` tool. |
| `wording_version` | The label the **tenant** configured (`voice_tenants.metadata.consent_capture.wording_version`, 1–64 chars of `A–Z a–z 0–9 . _ : -`). It identifies which wording the business says it used; the wording text is **never** sent or stored by this feature. |
| `recorded_at` | Server (database) time of the **newest consent decision about any scope** reflected in this object (including a withdrawal of a scope that is no longer listed), ISO-8601. It never moves backwards for a lead, so a receiver may order evidence by it. The AI cannot set it. |

Semantics (each is enforced by a test in `tests/unit/gateway/consent-evidence.test.ts`, `lead-events-consent.test.ts` and `tests/integration/klaros-consent-evidence-delivery.test.ts`):
- **Not consent:** placing or answering a call, pressing 1 to speak to the AI (the Compliance Center gate), a "consent required" setting, a transcript, or a lead simply existing. None of these writes a record or sets a field.
- **The only writer** is the `record_consent` tool (`realtime.tools.ts` → `services/consent/consent-evidence.ts`), offered only to a tenant that configured a wording version. The model supplies only `decision` (`granted` / `declined` / `withdrawn`) and `scopes`; an ambiguous, unknown or missing decision stores nothing.
- **Latest decision per scope wins**: a withdrawal removes an earlier grant of that scope only. Scopes recorded under a different wording version or method than the most recent decision are left out of the object rather than merged (narrower, never wider).
- **Change notification:** when `record_consent` stores a grant, decline or withdrawal for a call whose lead already exists, one `lead.updated` with `data = { leadId, consent }` (no name, phone or free text) is published, derived from the stored rows after the write. If no lead is linked to the call yet, nothing is published: the lead's creation event carries the evidence. If the rows cannot be attributed to exactly one lead, nothing is published.
- **Fail closed:** a missing table, database error, unparseable or future timestamp, unknown scope/method, or missing wording version yields **no `consent` key**.
- **Boundary whitelist:** the consumer rebuilds the object field by field (`sanitizeConsentEvidence`); extra keys (wording text, transcript, medical content, personal data) are dropped. `lead.qualified`, `lead.escalated`, `call.*` and `appointment.*` never carry it.
- **Signing is unchanged**: the object is part of the signed raw body (`sha256=HMAC(secret, "<ts>.<raw body>")`); altering it after signing fails verification.
- **Storage:** `public.lead_consents` (migration `075_lead_consents.sql`, **not yet applied anywhere**). Rows are keyed to the call until a lead exists, then linked to the lead created or matched on that call.

Open points for review (not decided by this change): `scope` is an **array** because one decision can cover several scopes and a
single-valued field cannot express "contact yes, medical information no" without lying; the Klaros receiver does not read `consent`
yet (this repository does not change Klaros); `granted: false` is emitted for a declined/withdrawn decision so Klaros can stop
processing, which the receiver must be taught to handle.

**This is evidence that an answer was recorded, not a statement of legal compliance.** Whether the wording, the recording method
and the retention period satisfy the law that applies to the business is a decision for the business owner and its counsel.

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
- Consent evidence (section 3.1) is proven only with an in-memory fake database and a local HTTP receiver. Migration 075 has not been applied, no tenant has a wording version configured, and the Klaros receiver has not been taught to read `consent`.
- The free Render instance sleeps (about 50 s cold start); a webhook delivery that hits a cold gateway or receiver is retried by the bus.

### Consent evidence: migrations and delivery guarantees (hardening)
- Migrations, in order: `075_lead_consents.sql`, `076_lead_consent_outbox.sql`, `077_lead_consents_ordering.sql` (adds `seq`, real-clock default). All additive and idempotent; **none has been applied by this change**. Deploy the gateway code only after all three are applied (the evidence query orders by `seq`; without 077 evidence reads fail closed to "no evidence").
- A recorded decision is ONE SQL statement: the outbox entry and every scope row are stored together or not at all.
- Order of decisions is `recorded_at` (database wall clock) then `seq`; a same-instant withdrawal stored after a grant wins.
- If one call produced two leads, a new grant is attributed to neither; a decline or withdrawal is copied to both and published for both.
- Delivery: the outbox entry is retried by the sweeper until the event is added to the Redis stream; Klaros de-duplicates on the event id and orders evidence by `recorded_at`.
- **Delivery-time refresh (reconciliation):** every publish gets a fresh random event id, and the bus, the sender and Klaros all treat a repeated id as a duplicate, so an id can never be re-used for a different consent state. Because a failed delivery is retried after later events were already sent, the consumer re-reads the stored consent for that tenant and lead at the moment of delivery for any `lead.created` / `lead.updated` that carries `consent` (`withFreshConsent`). A retried or delayed event therefore cannot deliver an older state than the one stored now, and the `recorded_at` sequence a receiver sees does not go backwards. If that read fails the handler throws: the bus retries (bounded, `P2_CONSUMER_MAX_RETRIES`, default 5) and then dead-letters the event; it is never sent stale and never dropped silently. Tests: `tests/integration/consent-delivery-ordering.test.ts`, `tests/integration/klaros-consent-evidence-delivery.test.ts` (in-memory Redis and database emulations; not real PostgreSQL or Redis).
- Two equal-content events (the outbox can publish a state more than once) are harmless to a receiver that applies `consent` idempotently by `recorded_at`; Klaros' behaviour here is unverified from this repository.
