-- Track which external calendar provider an appointment is synced to, so
-- reschedule/cancel can dispatch to the right provider (Google/Outlook/Acuity)
-- instead of only ever touching Google.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS calendar_provider TEXT CHECK (calendar_provider IN ('google', 'outlook', 'acuity'));

-- Backfill existing rows that already have a Google event id.
UPDATE public.appointments
SET calendar_provider = 'google'
WHERE calendar_provider IS NULL AND calendar_event_id IS NOT NULL;
