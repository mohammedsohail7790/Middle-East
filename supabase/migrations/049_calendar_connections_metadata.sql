-- Provider-specific calendar fields (Acuity userId, Calendly org URIs, Square merchant id, etc.)
ALTER TABLE public.calendar_connections
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.calendar_connections.metadata IS
  'Provider-specific connection fields (auth mode, external ids, display names)';

-- Allow Acuity and Square Appointments providers used by gateway calendar services
ALTER TABLE public.calendar_connections
  DROP CONSTRAINT IF EXISTS calendar_connections_provider_check;

ALTER TABLE public.calendar_connections
  ADD CONSTRAINT calendar_connections_provider_check
  CHECK (provider IN (
    'google',
    'outlook',
    'apple',
    'calendly',
    'cal_com',
    'acuity',
    'square-appointments'
  ));
