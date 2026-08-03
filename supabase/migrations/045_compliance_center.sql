-- Migration 045: Compliance Center
-- Per-tenant call compliance settings: AI disclosure, recording, consent,
-- data retention period, and industry compliance profile.

-- ─── Table: compliance_settings ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.compliance_settings (
  tenant_id                  UUID PRIMARY KEY
                               REFERENCES public.voice_tenants(id) ON DELETE CASCADE,

  -- AI Disclosure
  ai_disclosure_enabled      BOOLEAN NOT NULL DEFAULT true,
  ai_disclosure_message      TEXT    NOT NULL DEFAULT
    'This call is handled by an AI assistant.',

  -- Call Recording
  recording_enabled          BOOLEAN NOT NULL DEFAULT false,

  -- Recording Announcement (played before recording starts)
  recording_announcement_enabled  BOOLEAN NOT NULL DEFAULT true,
  recording_announcement_message TEXT    NOT NULL DEFAULT
    'This call may be recorded for quality and training purposes.',

  -- Caller Consent (press-1 gate before the AI takes over)
  consent_required           BOOLEAN NOT NULL DEFAULT false,
  consent_message            TEXT    NOT NULL DEFAULT
    'Press 1 to continue, or hang up to opt out.',

  -- Data Retention (days; NULL = keep indefinitely)
  data_retention_days        INTEGER CHECK (data_retention_days IS NULL OR data_retention_days > 0),

  -- Industry Compliance Profile
  -- Determines default settings and policy hints shown in the UI.
  industry_profile           TEXT    NOT NULL DEFAULT 'general'
    CHECK (industry_profile IN ('healthcare', 'legal', 'real_estate', 'general')),

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for bulk lookups (worker, reporting)
CREATE INDEX IF NOT EXISTS idx_compliance_settings_industry
  ON public.compliance_settings(industry_profile);

-- RLS
ALTER TABLE public.compliance_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Compliance settings: tenant members can read" ON public.compliance_settings;
CREATE POLICY "Compliance settings: tenant members can read"
  ON public.compliance_settings FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT id   FROM public.voice_tenants WHERE owner_user_id = auth.uid()
      UNION
      SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Compliance settings: admins can write" ON public.compliance_settings;
CREATE POLICY "Compliance settings: admins can write"
  ON public.compliance_settings FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT id   FROM public.voice_tenants WHERE owner_user_id = auth.uid()
      UNION
      SELECT tenant_id FROM public.team_members
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Service-role full access (gateway writes via pool with service role)
DROP POLICY IF EXISTS "Compliance settings: service role" ON public.compliance_settings;
CREATE POLICY "Compliance settings: service role"
  ON public.compliance_settings FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ─── Add voice_tenants.compliance_settings_applied flag ──────────────────────
-- Lightweight flag so the voice gateway knows whether to pull compliance_settings.
ALTER TABLE public.voice_tenants
  ADD COLUMN IF NOT EXISTS compliance_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON TABLE public.compliance_settings IS
  'Per-tenant Compliance Center settings: AI disclosure, recording, consent, retention, industry profile.';
