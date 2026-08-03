-- Google Calendar OAuth storage (align with gateway calendar.service)
ALTER TABLE public.calendar_connections
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Backfill expires_at from legacy column name
UPDATE public.calendar_connections
SET expires_at = token_expires_at
WHERE expires_at IS NULL AND token_expires_at IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_connections_tenant_provider
  ON public.calendar_connections (tenant_id, provider);
