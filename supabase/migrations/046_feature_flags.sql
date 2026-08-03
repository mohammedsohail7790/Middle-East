-- Migration 046: Tenant feature flags system
-- Allows enabling/disabling specific features per tenant
-- without full plan changes

CREATE TABLE IF NOT EXISTS public.tenant_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  flag_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  set_by_plan BOOLEAN NOT NULL DEFAULT true,  -- true = auto-set by plan, false = manual override
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, flag_name)
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_tenant ON public.tenant_feature_flags(tenant_id);
CREATE INDEX IF NOT EXISTS idx_feature_flags_name ON public.tenant_feature_flags(flag_name);

ALTER TABLE public.tenant_feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feature_flags_tenant_access"
  ON public.tenant_feature_flags FOR SELECT
  TO authenticated
  USING (public.user_can_access_tenant(tenant_id));

CREATE POLICY "feature_flags_service_role"
  ON public.tenant_feature_flags FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Known feature flags (documentation as a view)
CREATE OR REPLACE VIEW public.known_feature_flags AS
SELECT flag_name, description FROM (VALUES
  ('hipaa_mode',           'HIPAA compliance mode — restricts data handling'),
  ('baa_signed',           'Business Associate Agreement has been signed'),
  ('sla_monitoring',       'SLA uptime monitoring and credit tracking'),
  ('voice_cloning',        'Custom voice cloning for AI receptionist'),
  ('api_access',           'Developer API access via API keys'),
  ('advanced_analytics',   'Advanced analytics and BI exports'),
  ('multi_location',       'Multiple phone numbers and locations'),
  ('white_labeling',       'White label branding options'),
  ('custom_ivr',           'Custom IVR flow builder'),
  ('scim_provisioning',    'SCIM user provisioning for enterprise SSO'),
  ('phone_porting',        'Phone number porting requests'),
  ('scheduled_reports',    'Automated scheduled report emails'),
  ('spam_protection',      'AI spam call detection and blocking'),
  ('whatsapp_channel',     'WhatsApp messaging channel'),
  ('msp_mode',             'Managed Service Provider multi-tenant management')
) AS t(flag_name, description);
