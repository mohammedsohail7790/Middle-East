-- Sprint 1: Spam protection columns and settings
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS is_spam BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS spam_reason TEXT;

ALTER TABLE public.minutes_accounting
  ADD COLUMN IF NOT EXISTS is_billable BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.tenant_spam_settings (
  tenant_id UUID PRIMARY KEY REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  block_unknown_caller BOOLEAN NOT NULL DEFAULT false,
  stir_shaken_required BOOLEAN NOT NULL DEFAULT false,
  custom_blocklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  custom_allowlist JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calls_tenant_spam ON public.calls(tenant_id, is_spam) WHERE is_spam = true;

-- Sprint 2: HIPAA / BAA
ALTER TABLE public.voice_tenants
  ADD COLUMN IF NOT EXISTS hipaa_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.baa_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  signed_by TEXT NOT NULL,
  signed_by_email TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address TEXT,
  document_url TEXT,
  version TEXT NOT NULL DEFAULT '1.0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_baa_agreements_tenant ON public.baa_agreements(tenant_id, signed_at DESC);

-- Sprint 3: Phone porting
CREATE TABLE IF NOT EXISTS public.phone_port_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  carrier_name TEXT,
  account_number TEXT,
  account_pin TEXT,
  loa_document_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'in_progress', 'completed', 'failed', 'cancelled')),
  twilio_port_sid TEXT,
  failure_reason TEXT,
  submitted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phone_port_requests_tenant ON public.phone_port_requests(tenant_id, created_at DESC);

-- Sprint 3: Enterprise SLA + account manager
CREATE TABLE IF NOT EXISTS public.enterprise_accounts (
  tenant_id UUID PRIMARY KEY REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  csm_name TEXT,
  csm_email TEXT,
  csm_phone TEXT,
  sla_tier NUMERIC(5,2) NOT NULL DEFAULT 99.90,
  sla_signed_at TIMESTAMPTZ,
  uptime_credit_balance_cents INTEGER NOT NULL DEFAULT 0,
  last_uptime_percent NUMERIC(5,2),
  last_uptime_period TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sla_credit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  uptime_percent NUMERIC(5,2) NOT NULL,
  credit_cents INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sla_credit_events_tenant ON public.sla_credit_events(tenant_id, created_at DESC);
