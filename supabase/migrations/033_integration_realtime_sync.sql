-- Real-time integration sync cursors (last sync per tenant + provider)
CREATE TABLE IF NOT EXISTS public.integration_sync_state (
  tenant_id UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  last_sync_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  items_synced INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_integration_sync_state_updated
  ON public.integration_sync_state (updated_at DESC);

COMMENT ON TABLE public.integration_sync_state IS 'Tracks inbound/outbound integration sync timestamps for dashboard last_sync display';
