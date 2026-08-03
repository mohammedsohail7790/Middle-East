# 13 — DATABASE REFERENCE

## Database: Supabase PostgreSQL

**Extensions:** `pgcrypto`, `vector` (pgvector for embeddings)

## Core Tables

### `profiles`
User accounts linked to Supabase Auth.
```
id, user_id (FK auth.users), email, full_name, avatar_url, company_name,
subscription_tier (enum: free/pro/business), polar_customer_id, stripe_customer_id,
billing_metadata (jsonb), created_at, updated_at
```

### `voice_tenants`
Primary tenant table — one per customer business.
```
id, owner_user_id (FK auth.users), company_name, phone_number (unique),
default_language, timezone, diagnostic_fee, transfer_phone_number,
call_handling_mode, google_access_token, google_refresh_token, google_calendar_id,
voice_services (jsonb), voice_tone, voice_questions (jsonb), voice_id,
zapier_webhook_url, servicetitan_*, jobber_*, housecallpro_*, salesforce_*, hubspot_*,
custom_webhook_url, custom_webhook_headers (jsonb), branding (jsonb),
billing_block_reason, metadata (jsonb), created_at, updated_at
```

### `calls`
Every inbound/outbound call.
```
id, tenant_id (FK voice_tenants), call_sid (unique), transcript, recording_url,
language, latency, duration_ms, outcome, missed_reason, transfer_target, created_at
```

### `leads`
Captured lead information from calls.
```
id, tenant_id (FK voice_tenants), call_id, name, phone, service, notes,
preferred_time, fingerprint, created_at
```

### `appointments`
Booked appointments.
```
id, tenant_id (FK voice_tenants), name, phone, service, scheduled_time,
status (default 'booked'), calendar_event_id, created_at
```

### `knowledge_base`
Vector embeddings for RAG retrieval.
```
id, tenant_id (FK voice_tenants, nullable for global), category, content,
embedding (vector(1536)), created_at
```
**Index:** IVFFlat on embedding column for cosine similarity search.

### `knowledge_ingestion_runs`
Deduplication for file ingestion.
```
id, source, content_hash (unique), created_at
```

## Billing Tables

### `subscriptions`
```
id, tenant_id, stripe_customer_id, stripe_subscription_id,
plan (essential/professional/enterprise), status (active/canceled/past_due/trialing/...),
current_period_start, current_period_end, cancel_at_period_end,
trial_started_at, trial_expires_at, trial_minutes_used,
included_minutes, overage_minutes, overage_charged, billing_anchor, created_at
```

### `billing_warnings`
```
id, tenant_id, warning_type, message, details (jsonb),
acknowledged, acknowledged_at, created_at
```

### `minutes_accounting`
Per-call billing records.
```
id, tenant_id, subscription_id, call_sid, duration_seconds, billed_minutes,
source (voice/sms/api), is_trial, billing_period_start, billing_period_end, created_at
```

## Enterprise Tables (Migration 012)

### `audit_logs`
```
id, tenant_id, user_id, user_email, action, resource_type, resource_id,
old_value (jsonb), new_value (jsonb), ip_address, user_agent, created_at
```

### `tenant_api_keys`
```
id, tenant_id, name, key_hash (unique), key_prefix, scopes (text[]),
last_used_at, revoked_at, expires_at, created_by, created_at
```

### `custom_webhooks`
```
id, tenant_id, name, url, events (text[]), secret, headers (jsonb),
active, last_triggered_at, last_error, failure_count, created_at, updated_at
```

### `webhook_deliveries`
```
id, webhook_id, tenant_id, event_type, payload (jsonb),
response_status, response_body, delivered, attempted_at
```

### `data_retention_policies`
```
id, tenant_id (unique), call_recordings_days, call_transcripts_days,
lead_data_days, sms_messages_days, analytics_days, enabled, updated_at
```

### `sso_configs`
```
id, tenant_id (unique), provider (okta/azure_ad/google_workspace/saml_custom),
enabled, entity_id, sso_url, certificate, client_id, client_secret,
domain, attribute_mapping (jsonb), created_at, updated_at
```

### `ivr_flows`
```
id, tenant_id, name, active, greeting, steps (jsonb), created_at, updated_at
```

### `ai_agents`
Multi-agent definitions (sales, support, billing).
```
id, tenant_id, name, role, system_prompt, voice_id, tone, services (text[]),
max_duration_seconds, transfer_on_timeout, transfer_number,
knowledge_category, active, created_at, updated_at
```

### `scheduled_reports`
```
id, tenant_id, name, report_type, frequency, day_of_week, day_of_month,
time_of_day, recipients (text[]), format, include_raw_data, active,
last_sent_at, last_error, created_at, updated_at
```

### `msp_tenants`
Parent-child tenant relationships for resellers.
```
id, parent_tenant_id, child_tenant_id, relationship_type,
markup_percentage, custom_branding (jsonb), notes, created_at
```

### `ip_allowlist`
```
id, tenant_id, ip_address, description, enabled, created_at
```

### `voice_clones`
```
id, tenant_id, name, elevenlabs_voice_id (unique), status,
samples_uploaded, sample_duration_seconds, description, created_at, updated_at
```

### `qa_rubrics`
```
id, tenant_id, name, criteria (jsonb), active, created_at, updated_at
```

## Phone Provisioning Tables (Migration 010)

### `tenant_phone_numbers`
```
id, tenant_id, phone_number (unique), twilio_sid (unique), status,
capabilities (jsonb), friendly_name, monthly_cost, webhook_url, created_at
```

### `phone_number_logs`
```
id, tenant_id, action, phone_number, twilio_sid, details (jsonb), created_at
```

## Knowledge Files (Migration 017)

### `knowledge_files`
```
id, tenant_id, file_name, file_type, file_size, status, chunk_count,
error, created_at, updated_at
```

## Other Tables (from various migrations)

### `team_members` (Migration 009)
### `call_evaluations` (Migration 009)
### `sms_messages` (Migration 006)
### `automation_rules` (Migration 005)
### `integration_logs` (Migration 003)
### `spam_numbers` (Migration 013)
### `industry_templates` (Migration 014)
### `usage_records` (Migration 015)
### `onboarding_progress` (Migration 019)
### `call_costs` (Migration 018)

## Key Indexes

- `idx_calls_tenant_created_at` — Call listing by tenant
- `idx_leads_tenant_fingerprint_unique` — Lead deduplication
- `idx_knowledge_base_embedding` — IVFFlat vector search
- `idx_minutes_accounting_tenant_period` — Billing queries
- `idx_audit_logs_tenant` — Audit trail queries

## RLS Policies Summary

All tenant-scoped tables enforce RLS through ownership chain:
```
voice_tenants → owner_user_id = auth.uid()
calls/leads/appointments → tenant_id IN (SELECT id FROM voice_tenants WHERE owner_user_id = auth.uid())
enterprise tables → tenant_id IN (SELECT tenant_id FROM team_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))
```

## Redis Key Patterns

| Pattern | Purpose | TTL |
|---------|---------|-----|
| `voice:tenant:{id}` | Cached tenant config | 300s |
| `usage:{tenantId}:{period}` | Usage counter | 7 days |
| `concurrency:{tenantId}` | Active call count | 120s |
| `concurrency:global` | Global call count | 120s |
| `knowledge:{tenantId}:{queryHash}` | Knowledge cache | 300s |
| `health:ping` | Health check probe | 10s |
| `rate:{ip}` | Rate limit counter | 60s |
| `ws:burst:{ip}` | WebSocket burst counter | 10s |
| `ws:reconnect:{ip}` | Reconnect cooldown | 2s |
| `ws:tenant:{tenantId}` | Tenant WS connection count | 120s |
