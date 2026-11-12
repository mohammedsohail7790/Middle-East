-- Calendly bookings made through the Scheduling API are tracked on the
-- appointment (event URI in external_calendar_event_id) so reschedule/cancel
-- from a call can reach Calendly.
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_calendar_provider_check;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_calendar_provider_check
  CHECK (calendar_provider IS NULL OR calendar_provider IN ('google', 'outlook', 'acuity', 'calendly'));
