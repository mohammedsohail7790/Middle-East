-- P4-B: Enterprise auth sessions, SCIM, QA quality history, search helpers

CREATE TABLE IF NOT EXISTS public.enterprise_auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  device_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  mfa_verified BOOLEAN DEFAULT false,
  revoked_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ent_auth_sessions_user
  ON public.enterprise_auth_sessions(tenant_id, user_id);

CREATE TABLE IF NOT EXISTS public.org_auth_policies (
  tenant_id UUID PRIMARY KEY,
  mfa_required BOOLEAN DEFAULT false,
  sso_required BOOLEAN DEFAULT false,
  ip_allowlist JSONB DEFAULT '[]'::JSONB,
  session_max_age_hours INT DEFAULT 168,
  suspicious_login_alert BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.scim_directory_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  external_id TEXT NOT NULL,
  email TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  role TEXT DEFAULT 'operator',
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, external_id)
);

CREATE TABLE IF NOT EXISTS public.call_quality_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  call_id UUID,
  call_sid TEXT,
  overall_score NUMERIC(5,2),
  booking_quality NUMERIC(5,2),
  sentiment_score NUMERIC(5,2),
  interruption_rate NUMERIC(5,2),
  escalation_detected BOOLEAN DEFAULT false,
  failure_class TEXT,
  payload JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_quality_tenant_time
  ON public.call_quality_scores(tenant_id, created_at DESC);

-- Transcript search (simple ILIKE index support via pg_trgm optional)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_calls_transcript_trgm
  ON public.calls USING gin (transcript gin_trgm_ops)
  WHERE transcript IS NOT NULL AND length(transcript) > 0;
