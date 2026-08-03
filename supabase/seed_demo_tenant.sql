-- =====================================================
-- Seed Demo Tenant for Call IQ
-- Run this in Supabase Dashboard > SQL Editor
-- =====================================================

-- 1. Create a demo tenant (replace owner_user_id with a real auth.users UUID if you have one)
INSERT INTO public.voice_tenants (
  owner_user_id,
  company_name,
  phone_number,
  default_language,
  timezone,
  diagnostic_fee,
  call_handling_mode,
  voice_tone,
  voice_services,
  voice_questions,
  metadata
)
SELECT
  COALESCE(
    (SELECT id FROM auth.users LIMIT 1),
    '00000000-0000-0000-0000-000000000000'::uuid
  ),
  'Call IQ Demo Business',
  '+19193715609',
  'en',
  'America/New_York',
  125,
  'message',
  'friendly, concise, and professional',
  '["greeting", "appointment_scheduling", "faq"]'::jsonb,
  '[
    "What service are you calling about?",
    "What is your name?",
    "What is your phone number?",
    "When would you like to schedule?"
  ]'::jsonb,
  '{"industry": "hvac", "services_offered": ["AC Repair", "Heating", "Maintenance"]}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.voice_tenants WHERE phone_number = '+19193715609'
);

-- 2. Link the phone number in tenant_phone_numbers
INSERT INTO public.tenant_phone_numbers (
  tenant_id,
  phone_number,
  twilio_sid,
  status,
  capabilities,
  friendly_name
)
SELECT
  vt.id,
  '+19193715609',
  'PN_demo_' || gen_random_uuid()::text,
  'active',
  '{"voice": true, "sms": true}'::jsonb,
  'Call IQ Main Line'
FROM public.voice_tenants vt
WHERE vt.phone_number = '+19193715609'
  AND NOT EXISTS (
    SELECT 1 FROM public.tenant_phone_numbers tpn
    WHERE tpn.phone_number = '+19193715609'
  );

-- 3. Verify the data
SELECT '=== TENANTS ===' AS info;
SELECT id, company_name, phone_number, call_handling_mode, voice_tone
FROM public.voice_tenants
WHERE phone_number = '+19193715609';

SELECT '=== PHONE NUMBERS ===' AS info;
SELECT tpn.id, tpn.phone_number, tpn.status, vt.company_name
FROM public.tenant_phone_numbers tpn
JOIN public.voice_tenants vt ON vt.id = tpn.tenant_id
WHERE tpn.phone_number = '+19193715609';

SELECT '=== TEST LOOKUP ===' AS info;
SELECT * FROM public.get_tenant_by_phone_number('+19193715609');
