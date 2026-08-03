-- Migration 047: Integration Hub
-- Unified, metadata-driven integration registry with encrypted per-tenant
-- credential storage, structured event logs, and async sync job tracking.
-- Existing OAuth flows (hubspot/salesforce/google/outlook/calendly/slack/
-- pipedrive/servicetitan/jobber) and their plaintext voice_tenants columns
-- are left untouched; this is additive.

-- Registry of all integrations (seed data drives the dashboard catalog UI)
CREATE TABLE IF NOT EXISTS public.integrations (
  id TEXT PRIMARY KEY,                  -- slug, e.g. 'pipedrive', 'acuity'
  name TEXT NOT NULL,
  category TEXT NOT NULL,               -- crm | calendar | field_service | property_management | automation | communication
  auth_type TEXT NOT NULL,              -- oauth | api_credentials
  is_advanced BOOLEAN NOT NULL DEFAULT false,  -- true only for 'zapier'
  ready BOOLEAN NOT NULL DEFAULT true,  -- false = "coming soon"
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-tenant connection + encrypted credentials
CREATE TABLE IF NOT EXISTS public.integration_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  integration_id TEXT NOT NULL REFERENCES public.integrations(id),
  auth_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected', -- disconnected | connected | error | coming_soon
  credentials_encrypted TEXT,           -- AES-256-GCM ciphertext: base64(iv).base64(tag).base64(data)
  config JSONB NOT NULL DEFAULT '{}'::jsonb,   -- non-secret fields (portalId, accountId, domain...)
  last_sync_at TIMESTAMPTZ,
  last_test_at TIMESTAMPTZ,
  last_error TEXT,
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, integration_id)
);

CREATE INDEX IF NOT EXISTS idx_integration_connections_tenant ON public.integration_connections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_integration_connections_integration ON public.integration_connections(integration_id);

-- Structured connect/verify/test/sync event log
CREATE TABLE IF NOT EXISTS public.integration_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  integration_id TEXT NOT NULL,
  action TEXT NOT NULL,                 -- connect | verify | test | sync | disconnect
  level TEXT NOT NULL DEFAULT 'info',   -- info | warn | error
  message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_logs_tenant ON public.integration_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_integration_logs_connection ON public.integration_logs(connection_id);
CREATE INDEX IF NOT EXISTS idx_integration_logs_created ON public.integration_logs(created_at DESC);

-- Async sync/test job tracking
CREATE TABLE IF NOT EXISTS public.integration_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  integration_id TEXT NOT NULL,
  job_type TEXT NOT NULL,               -- sync | test_lead | test_appointment | verify
  status TEXT NOT NULL DEFAULT 'pending', -- pending | running | success | failed
  result JSONB,
  error TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_sync_jobs_tenant ON public.integration_sync_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_integration_sync_jobs_connection ON public.integration_sync_jobs(connection_id);

-- updated_at maintenance
CREATE OR REPLACE FUNCTION public.set_integration_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_integrations_updated_at ON public.integrations;
CREATE TRIGGER trg_integrations_updated_at
  BEFORE UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_integration_updated_at();

DROP TRIGGER IF EXISTS trg_integration_connections_updated_at ON public.integration_connections;
CREATE TRIGGER trg_integration_connections_updated_at
  BEFORE UPDATE ON public.integration_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_integration_updated_at();

-- RLS
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_sync_jobs ENABLE ROW LEVEL SECURITY;

-- integrations: read-only catalog, visible to all authenticated users
CREATE POLICY "integrations_read_all"
  ON public.integrations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "integrations_service_role"
  ON public.integrations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- integration_connections: tenant-scoped
CREATE POLICY "integration_connections_tenant_access"
  ON public.integration_connections FOR SELECT
  TO authenticated
  USING (public.user_can_access_tenant(tenant_id));

CREATE POLICY "integration_connections_service_role"
  ON public.integration_connections FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- integration_logs: tenant-scoped, read-only for authenticated users
CREATE POLICY "integration_logs_tenant_access"
  ON public.integration_logs FOR SELECT
  TO authenticated
  USING (public.user_can_access_tenant(tenant_id));

CREATE POLICY "integration_logs_service_role"
  ON public.integration_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- integration_sync_jobs: tenant-scoped, read-only for authenticated users
CREATE POLICY "integration_sync_jobs_tenant_access"
  ON public.integration_sync_jobs FOR SELECT
  TO authenticated
  USING (public.user_can_access_tenant(tenant_id));

CREATE POLICY "integration_sync_jobs_service_role"
  ON public.integration_sync_jobs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Seed the integration registry (26 integrations across 6 categories)
INSERT INTO public.integrations (id, name, category, auth_type, is_advanced, ready, sort_order) VALUES
  ('hubspot',             'HubSpot',             'crm',                  'oauth',           false, true,  10),
  ('salesforce',          'Salesforce',          'crm',                  'oauth',           false, true,  20),
  ('pipedrive',           'Pipedrive',           'crm',                  'oauth',           false, true,  30),
  ('freshsales',          'Freshsales',          'crm',                  'api_credentials', false, true,  40),
  ('insightly',           'Insightly',           'crm',                  'api_credentials', false, true,  50),
  ('zoho',                'Zoho CRM',            'crm',                  'api_credentials', false, true,  60),
  ('copper',              'Copper',              'crm',                  'api_credentials', false, true,  70),
  ('followupboss',        'Follow Up Boss',      'crm',                  'api_credentials', false, true,  80),
  ('clio',                'Clio',                'crm',                  'api_credentials', false, false, 90),
  ('mycase',              'MyCase',              'crm',                  'api_credentials', false, false, 100),
  ('google-calendar',     'Google Calendar',     'calendar',             'oauth',           false, true,  110),
  ('outlook',             'Outlook Calendar',    'calendar',             'oauth',           false, true,  120),
  ('calendly',            'Calendly',            'calendar',             'oauth',           false, true,  130),
  ('acuity',              'Acuity Scheduling',   'calendar',             'api_credentials', false, true,  140),
  ('setmore',             'Setmore',             'calendar',             'api_credentials', false, true,  150),
  ('square-appointments', 'Square Appointments', 'calendar',             'api_credentials', false, true,  160),
  ('vagaro',              'Vagaro',              'calendar',             'api_credentials', false, false, 170),
  ('mindbody',            'Mindbody',            'calendar',             'api_credentials', false, false, 180),
  ('servicetitan',        'ServiceTitan',        'field_service',        'oauth',           false, true,  190),
  ('jobber',               'Jobber',              'field_service',        'oauth',           false, true,  200),
  ('housecallpro',        'Housecall Pro',       'field_service',        'api_credentials', false, true,  210),
  ('buildium',            'Buildium',            'property_management',  'api_credentials', false, true,  220),
  ('appfolio',            'AppFolio',            'property_management',  'api_credentials', false, false, 230),
  ('yardi',               'Yardi',               'property_management',  'api_credentials', false, false, 240),
  ('slack',               'Slack',               'communication',        'oauth',           false, true,  250),
  ('zapier',              'Zapier',              'automation',           'api_credentials', true,  true,  260)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  auth_type = EXCLUDED.auth_type,
  is_advanced = EXCLUDED.is_advanced,
  ready = EXCLUDED.ready,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

COMMENT ON TABLE public.integrations IS 'Catalog of all integrations available in the Integration Hub (drives dashboard UI + server dispatch)';
COMMENT ON TABLE public.integration_connections IS 'Per-tenant integration connection state with AES-256-GCM encrypted credentials';
COMMENT ON TABLE public.integration_logs IS 'Structured audit trail for connect/verify/test/sync/disconnect events per connection';
COMMENT ON TABLE public.integration_sync_jobs IS 'Async sync/test job tracking for integration connections';
