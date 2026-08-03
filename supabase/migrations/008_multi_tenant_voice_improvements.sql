-- Migration 008: Multi-Tenant Voice System Improvements
-- Created: 2026-04-27
-- Description: Add missing columns for true multi-tenant voice system

-- =====================================================
-- VOICE TENANTS ENHANCEMENTS
-- =====================================================

-- Add phone_number column (for tenant identification)
ALTER TABLE public.voice_tenants
ADD COLUMN IF NOT EXISTS phone_number TEXT UNIQUE;

-- Add system_prompt column (custom AI prompt per tenant)
ALTER TABLE public.voice_tenants
ADD COLUMN IF NOT EXISTS system_prompt TEXT;

-- Add voice_id column (ElevenLabs voice ID per tenant)
ALTER TABLE public.voice_tenants
ADD COLUMN IF NOT EXISTS voice_id TEXT;

-- Add settings column (flexible JSON config per tenant)
ALTER TABLE public.voice_tenants
ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::JSONB;

-- Create index for fast phone number lookups
CREATE INDEX IF NOT EXISTS idx_voice_tenants_phone 
  ON public.voice_tenants(phone_number);

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON COLUMN public.voice_tenants.phone_number IS 'Twilio phone number for this tenant (used for routing)';
COMMENT ON COLUMN public.voice_tenants.system_prompt IS 'Custom AI system prompt (overrides default if provided)';
COMMENT ON COLUMN public.voice_tenants.voice_id IS 'ElevenLabs voice ID for TTS (overrides default if provided)';
COMMENT ON COLUMN public.voice_tenants.settings IS 'Flexible JSON settings (greeting, fallback messages, etc.)';

-- =====================================================
-- EXAMPLE DATA (for testing)
-- =====================================================

-- Example: HVAC Company
-- INSERT INTO public.voice_tenants (
--   company_name,
--   phone_number,
--   system_prompt,
--   voice_id,
--   voice_services,
--   voice_tone,
--   default_language,
--   settings
-- ) VALUES (
--   'Cool Air HVAC',
--   '+15551234567',
--   'You are Sarah, a friendly and knowledgeable HVAC receptionist for Cool Air HVAC. You help customers with AC repair, heating installation, and maintenance plans. Always be warm, empathetic, and helpful.',
--   'voice_id_sarah',
--   '["AC Repair", "Heating Installation", "Maintenance Plans", "Emergency Service"]'::jsonb,
--   'warm and friendly',
--   'en',
--   '{"greeting": "Thank you for calling Cool Air HVAC! This is Sarah. How can I help you today?"}'::jsonb
-- );

-- Example: Plumbing Company
-- INSERT INTO public.voice_tenants (
--   company_name,
--   phone_number,
--   system_prompt,
--   voice_id,
--   voice_services,
--   voice_tone,
--   default_language,
--   settings
-- ) VALUES (
--   'Pro Plumbing',
--   '+15559876543',
--   'You are Mike, a professional and efficient plumbing dispatcher for Pro Plumbing. You handle leak repairs, drain cleaning, and water heater installations. Be direct, professional, and solution-focused.',
--   'voice_id_mike',
--   '["Leak Repair", "Drain Cleaning", "Water Heater Installation", "Pipe Replacement"]'::jsonb,
--   'professional and direct',
--   'en',
--   '{"greeting": "Pro Plumbing, this is Mike. What plumbing issue can I help you with?"}'::jsonb
-- );
