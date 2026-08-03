-- Ensure post-call + dashboard data flow (run if leads/appointments still empty after calls)

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS preferred_time TEXT,
  ADD COLUMN IF NOT EXISTS fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS call_id UUID,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'inbound_call',
  ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb;

DROP INDEX IF EXISTS public.idx_leads_fingerprint;
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_tenant_fingerprint_unique
  ON public.leads (tenant_id, fingerprint)
  WHERE fingerprint IS NOT NULL;
