# 10 — SECURITY AND COMPLIANCE

## Authentication

### JWT
- **File:** `services/jwt-rotation.ts`
- Secret: `JWT_SECRET` (32+ characters)
- Expiry: Configurable via `JWT_EXPIRES_IN` (default 7d)
- Used for: API authentication, service-to-service

### Supabase Auth
- Email/password authentication
- OAuth providers (Google, etc.)
- Session management via `@supabase/ssr`
- Auto-creates profile on signup (trigger)

### API Keys
- **File:** `services/api-keys/apiKey.service.ts`
- Tenant-scoped API keys stored as hashed values
- Prefix displayed for identification (`sk_calliq_...`)
- Scopes: `read`, `write`, `webhooks`
- Revocation and expiry support

## Authorization

### Row Level Security (RLS)
All tenant-scoped tables enforce RLS:
- `voice_tenants` — `owner_user_id = auth.uid()`
- `calls`, `leads`, `appointments` — Through tenant ownership chain
- Enterprise tables — Through `team_members` role check

### Plan-Based Gating
- **File:** `middleware/plan-gating.ts`
- `requirePlan(feature)` — Feature-level gate
- `requireEnterprise()` — Enterprise-only
- `requireProfessionalOrHigher()` — Rank-based
- `requireCallMinutes()` — Usage-based

### Internal API Key
- `VOICE_INTERNAL_API_KEY` — Gateway-to-dashboard auth
- `ADMIN_API_KEY` — Admin endpoint access
- Validated in `services/voice/security.ts`

## Rate Limiting

### HTTP Rate Limiting
- **Library:** `express-rate-limit`
- Window: 15 minutes (configurable)
- Max: 100 requests per window
- Applied to all `/api/` routes

### WebSocket Rate Limiting
- **File:** `services/ws-rate-limiter.ts`
- Per-IP rate: 60 connections per minute
- Burst protection: Max 5 rapid connections
- Reconnect cooldown: 2 seconds between reconnects
- Per-tenant limit: Configurable max connections

## Webhook Verification

### Stripe
```typescript
const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
```

### Twilio
- IP allowlist: `TWILIO_ALLOWED_IPS`
- Auth token validation for webhook signatures

## Security Headers

Applied to all responses:
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 0
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload (production only)
```

## CORS Configuration

```typescript
cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  maxAge: 86400,
});
```

## Tenant Isolation

1. **Database:** RLS policies on all tables
2. **API:** `x-tenant-id` header required and validated
3. **Redis:** Keys namespaced by tenant ID
4. **Knowledge base:** Queries scoped to tenant
5. **WebSocket:** Tenant extracted from URL path
6. **Integrations:** Credentials stored per-tenant

## Audit Logging

**Table:** `audit_logs`
**File:** `services/audit/audit.service.ts`

Tracked actions:
- Tenant CRUD
- Team member changes
- AI config updates
- Phone number operations
- Integration connections
- Webhook management
- API key operations
- SSO configuration
- Data retention policy changes

## Data Retention

**Table:** `data_retention_policies`
**File:** `services/data-retention/retention.service.ts`

Configurable per tenant:
- Call recordings: Default 90 days
- Transcripts: Default 180 days
- Lead data: Default 365 days
- SMS messages: Default 90 days
- Analytics: Default 730 days

Cleanup function: `cleanup_retention_data()` (PostgreSQL function)

## IP Allowlist

**Table:** `ip_allowlist`
**File:** `services/security/ipAllowlist.ts`

- Enterprise feature
- CIDR notation support (e.g., `192.168.1.0/24`)
- Applied via middleware to all API routes
- Bypass for Twilio webhook IPs

## HIPAA Readiness (Enterprise)

- Data encryption at rest (Supabase)
- Data encryption in transit (TLS)
- Audit logging
- Data retention policies
- Access controls (RLS + team roles)
- BAA required with Supabase and sub-processors

## SSO / SAML (Enterprise)

**Table:** `sso_configs`
**File:** `services/sso/sso.service.ts`

Supported providers:
- Okta
- Azure AD
- Google Workspace
- Custom SAML

## Secrets Management

- All secrets in environment variables
- Render: `sync: false` for manual secrets
- Render: `generateValue: true` for auto-generated
- No secrets in code or version control
- `.env` in `.gitignore`

## PII Handling

**File:** `services/voice/pii.ts`
- PII detection in transcripts
- Redaction capabilities
- Secure storage of sensitive data
