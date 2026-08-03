-- Migration 059: Consent recording choice
-- Lets a tenant offer callers a choice at the consent gate — press 1 to
-- consent to recording, press 2 to continue without recording — instead of
-- the simple "press 1 to continue or hang up" gate.

ALTER TABLE public.compliance_settings
  ADD COLUMN IF NOT EXISTS consent_offers_recording_choice BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_recording_choice_message TEXT NOT NULL DEFAULT
    'If you consent to this call being recorded and transcribed, press 1. To continue without recording, press 2.';
