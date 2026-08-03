# 05 — TENANT AND MULTITENANCY

## Tenant Model

Each customer business is a **tenant** stored in `public.voice_tenants`.

### Primary Table: `voice_tenants`

```sql
CREATE TABLE public.voice_tenants (
  id uuid PRIMARY KEY,
  owner_user_id uuid REFERENCES auth.users(id),
  company_name text NOT NULL,
  phone_number text NOT NULL UNIQUE,
  default_language text DEFAULT 'en',
  timezone text DEFAULT 'UTC',
  diagnostic_fee numeric DEFAULT 125,
  transfer_phone_number text,
  call_handling_mode text DEFAULT 'message',  -- message | transfer | both
  
  -- Google Calendar
  google_access_token text,
  google_refresh_token text,
  google_calendar_id text,
  
  -- Voice AI
  voice_services jsonb DEFAULT '[]',
  voice_tone text DEFAULT 'friendly, concise, and professional',
  voice_questions jsonb DEFAULT '[]',
  voice_id text,
  
  -- Integrations
  zapier_webhook_url text,
  servicetitan_enabled boolean, servicetitan_api_key text, ...
  jobber_enabled boolean, jobber_api_token text, ...
  housecallpro_enabled boolean, housecallpro_api_key text, ...
  salesforce_enabled boolean, salesforce_instance_url text, ...
  hubspot_enabled boolean, hubspot_api_key text, ...
  custom_webhook_url text,
  
  -- Enterprise
  branding jsonb DEFAULT '{}',
  billing_block_reason text,
  metadata jsonb DEFAULT '{}',
  
  created_at timestamptz, updated_at timestamptz
);
```

## Tenant Isolation

### Supabase Row Level Security (RLS)

All tenant-scoped tables have RLS enabled:

```sql
-- voice_tenants: owner can manage
CREATE POLICY "Users can manage own voice tenants"
  ON public.voice_tenants FOR ALL
  USING (owner_user_id = auth.uid());

-- calls: scoped through tenant ownership
CREATE POLICY "Voice tenant owners can view calls"
  ON public.calls FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.voice_tenants vt
    WHERE vt.id = calls.tenant_id AND vt.owner_user_id = auth.uid()
  ));
```

### Gateway-Level Isolation

- All API requests require `x-tenant-id` header
- Tenant ID validated against JWT claims
- Database queries always include `WHERE tenant_id = $1`
- Redis keys namespaced: `tenant:{tenantId}:*`
- Knowledge base queries: `WHERE tenant_id = $1 OR tenant_id IS NULL`

## Tenant Configuration

### Voice Config (loaded per call)

**File:** `apps/gateway/src/services/voice/ai.service.ts` → `getTenantVoiceConfig()`

```typescript
interface TenantVoiceConfig {
  tenantId: string;
  businessName: string;
  industry?: string;
  services: string[];
  tone: string;
  questions: string[];
  defaultLanguage: string;
  languageMode?: 'strict' | 'adaptive';
  timezone: string;
  workingHours?: string;
  diagnosticFee: number;
  transferPhoneNumber?: string;
  callHandlingMode: 'message' | 'transfer' | 'both';
  integrations: { zapierWebhookUrl?: string };
  agentName: string;
  welcomeMessage: string;
  voiceId?: string;
}
```

### AI Agent Config (advanced customization)

**File:** `apps/gateway/src/services/ai-config/ai-config.service.ts`

```typescript
interface AIAgentConfig {
  model: string;
  temperature: number;
  agentName: string;
  personality: string;
  tone: string;
  speakingStyle: string;
  businessDescription?: string;
  servicesOffered: string[];
  greetingMessage: string;
  qualificationQuestions: any[];
  maxConversationTurns: number;
  autoTransferEnabled: boolean;
  systemInstructions?: string;
  doInstructions: string[];
  dontInstructions: string[];
  language: string;
  voiceId?: string;
  speechRate: number;
}
```

## Phone Number Management

### Table: `tenant_phone_numbers`

```sql
CREATE TABLE tenant_phone_numbers (
  id uuid PRIMARY KEY,
  tenant_id uuid REFERENCES voice_tenants(id),
  phone_number text NOT NULL UNIQUE,
  twilio_sid text NOT NULL UNIQUE,
  status text DEFAULT 'active',  -- active | releasing | released
  capabilities jsonb,
  friendly_name text,
  monthly_cost numeric DEFAULT 1.15,
  webhook_url text
);
```

### Lookup Function

```sql
CREATE FUNCTION get_tenant_by_phone_number(p_phone_number TEXT)
-- Returns tenant_id, company_name from tenant_phone_numbers
-- Falls back to voice_tenants.phone_number for legacy single-number tenants
```

## Team Members

### Table: `team_members` (from migration 009)

Roles: `owner`, `admin`, `member`, `viewer`

Used for:
- RLS policies (admin-only operations)
- Dashboard access control
- Audit log attribution

## Onboarding Flow

**File:** `apps/gateway/src/services/onboarding/onboarding.service.ts`

Steps tracked in `onboarding_progress` table:
1. Account creation
2. Business info
3. Phone number purchase
4. AI greeting configuration
5. Calendar integration
6. Test call
7. Billing activation

## Feature Flags / Governance

**File:** `apps/gateway/src/services/tenant-policy-engine.ts`

Per-tenant feature flags stored in `metadata` jsonb column:
- Custom features can be enabled/disabled per tenant
- Plan-based restrictions enforced via `plan-config.ts`
- Override capability for enterprise customers

## Provisioning

**File:** `apps/gateway/src/services/tenant-provisioning.ts`

Automated tenant creation:
1. Create `voice_tenants` record
2. Create `subscriptions` record (trial)
3. Set up default AI config
4. Initialize onboarding progress
5. Send welcome email
