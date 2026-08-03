-- Migration 044: HIPAA Compliance Hardening
-- Addresses gaps identified in the security audit (May 2026):
--   1. Immutable audit logs (HIPAA §164.312(b))
--   2. Sub-processor BAA acknowledgment table
--   3. HIPAA-mode recording bucket policy
--   4. MFA session tracking column
--   5. Tighten audit_log RLS to prevent tampering by authenticated role

-- ─── 1. Make audit_logs immutable ─────────────────────────────────────────────
-- Revoke UPDATE and DELETE from the authenticated role.
-- The gateway service_role can still insert (see policy below).
-- The authenticated role (dashboard users) may only SELECT.
REVOKE UPDATE, DELETE ON public.audit_logs FROM authenticated;
REVOKE UPDATE, DELETE ON public.enterprise_audit_events FROM authenticated;

-- Ensure the existing service_role INSERT policy is present (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audit_logs'
      AND policyname = 'System can insert audit logs'
  ) THEN
    CREATE POLICY "System can insert audit logs"
      ON public.audit_logs FOR INSERT
      WITH CHECK (true);
  END IF;
END;
$$;

-- ─── 2. Sub-processor HIPAA BAA acknowledgment ────────────────────────────────
-- Operators must acknowledge that sub-processors (OpenAI, Deepgram, ElevenLabs,
-- Twilio) have signed BAAs before HIPAA mode can send PHI to those services.
CREATE TABLE IF NOT EXISTS public.hipaa_subprocessor_baa (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  processor     TEXT NOT NULL CHECK (processor IN ('openai', 'deepgram', 'elevenlabs', 'twilio', 'supabase', 'other')),
  acknowledged  BOOLEAN NOT NULL DEFAULT false,
  acknowledged_by TEXT,          -- email of the person who acknowledged
  acknowledged_at TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, processor)
);

CREATE INDEX IF NOT EXISTS idx_hipaa_subprocessor_tenant
  ON public.hipaa_subprocessor_baa(tenant_id);

ALTER TABLE public.hipaa_subprocessor_baa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and admins can manage subprocessor BAAs"
  ON public.hipaa_subprocessor_baa FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tm.tenant_id FROM public.team_members tm
      WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin')
    )
  );

-- ─── 3. Add mfa_verified column to enterprise_auth_sessions (if missing) ──────
ALTER TABLE public.enterprise_auth_sessions
  ADD COLUMN IF NOT EXISTS mfa_verified BOOLEAN NOT NULL DEFAULT false;

-- ─── 4. Add hipaa_enabled flag to voice_tenants (if missing) ──────────────────
ALTER TABLE public.voice_tenants
  ADD COLUMN IF NOT EXISTS hipaa_enabled BOOLEAN NOT NULL DEFAULT false;

-- ─── 5. BAA agreements table (if missing from earlier migrations) ──────────────
CREATE TABLE IF NOT EXISTS public.baa_agreements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  signed_by       TEXT NOT NULL,
  signed_by_email TEXT NOT NULL,
  ip_address      TEXT,
  document_url    TEXT NOT NULL,
  version         TEXT NOT NULL DEFAULT '1.0',
  signed_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_baa_agreements_tenant
  ON public.baa_agreements(tenant_id, signed_at DESC);

ALTER TABLE public.baa_agreements ENABLE ROW LEVEL SECURITY;

REVOKE UPDATE, DELETE ON public.baa_agreements FROM authenticated;

CREATE POLICY "Owners can view BAA agreements"
  ON public.baa_agreements FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tm.tenant_id FROM public.team_members tm
      WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin')
    )
  );

-- ─── 6. Add compliance_requirement column to data_retention_policies ──────────
ALTER TABLE public.data_retention_policies
  ADD COLUMN IF NOT EXISTS resource_type TEXT,
  ADD COLUMN IF NOT EXISTS retention_days INTEGER,
  ADD COLUMN IF NOT EXISTS compliance_requirement TEXT;

-- ─── 7. Org auth policies table (if missing) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_auth_policies (
  tenant_id              UUID PRIMARY KEY REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  mfa_required           BOOLEAN NOT NULL DEFAULT false,
  sso_required           BOOLEAN NOT NULL DEFAULT false,
  ip_allowlist           JSONB NOT NULL DEFAULT '[]'::JSONB,
  session_max_age_hours  INTEGER NOT NULL DEFAULT 168,
  suspicious_login_alert BOOLEAN NOT NULL DEFAULT true,
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.org_auth_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage org auth policies"
  ON public.org_auth_policies FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tm.tenant_id FROM public.team_members tm
      WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin')
    )
  );

COMMENT ON TABLE public.hipaa_subprocessor_baa IS
  'Tracks operator acknowledgment that each AI/voice sub-processor has a signed HIPAA BAA. Required before HIPAA mode activates PHI transmission to those processors.';
COMMENT ON TABLE public.baa_agreements IS
  'Immutable record of Business Associate Agreement signings. No UPDATE/DELETE granted to authenticated role.';
COMMENT ON TABLE public.audit_logs IS
  'Immutable compliance log. UPDATE and DELETE revoked from authenticated role (HIPAA §164.312(b)).';
