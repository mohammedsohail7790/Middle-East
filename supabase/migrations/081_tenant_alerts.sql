-- 081: Tenant alerts
-- A saved, per-business list of things that need attention: minutes running out, a trial about to end, a connected tool that stopped working.
-- Until now the dashboard bell only showed live events and forgot them when the page closed, and billing warnings were stored but never shown or emailed.
-- Written by the gateway, read through the gateway API only: RLS is on, there are no policies, and browser roles have no access. Additive only.

CREATE TABLE IF NOT EXISTS public.tenant_alerts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                                   -- e.g. usage_90_percent, integration_failed
  severity    TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  title       TEXT NOT NULL,
  title_ar    TEXT,
  body        TEXT NOT NULL,
  body_ar     TEXT,
  href        TEXT NOT NULL DEFAULT '/dashboard',
  dedupe_key  TEXT NOT NULL,                                   -- the same thing is never alerted twice
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at     TIMESTAMPTZ,
  emailed_at  TIMESTAMPTZ,
  UNIQUE (tenant_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS tenant_alerts_tenant_recent_idx ON public.tenant_alerts (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tenant_alerts_tenant_unread_idx ON public.tenant_alerts (tenant_id) WHERE read_at IS NULL;

ALTER TABLE public.tenant_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_alerts FROM anon, authenticated;
