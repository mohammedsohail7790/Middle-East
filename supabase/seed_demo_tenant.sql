-- =====================================================
-- Seed Demo Tenant for Halla AI (GCC / Middle East)
-- Run this in Supabase Dashboard > SQL Editor
-- =====================================================
-- Demo uses a UAE (+971) phone number and Asia/Dubai timezone.
-- Replace owner_user_id with a real auth.users UUID if you have one.

-- 1. Create a demo tenant
INSERT INTO public.voice_tenants (
  owner_user_id,
  company_name,
  phone_number,
  default_language,
  timezone,
  currency,
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
  'Halla AI Demo Business',
  '+97145551234',          -- UAE demo number (+971 4 555 1234)
  'ar',                    -- Arabic default
  'Asia/Dubai',            -- UTC+4
  'AED',
  0,                       -- No diagnostic fee for ME market
  'message',
  'warm, professional, and helpful',
  '["greeting", "appointment_scheduling", "faq"]'::jsonb,
  '[
    "ما الخدمة التي تحتاجها؟",
    "ما اسمك الكريم؟",
    "ما رقم هاتفك؟",
    "متى تفضل الموعد؟"
  ]'::jsonb,
  '{"industry": "services", "services_offered": ["استشارات", "صيانة", "دعم فني"], "region": "gcc"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.voice_tenants WHERE phone_number = '+97145551234'
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
  '+97145551234',
  'PN_demo_' || gen_random_uuid()::text,
  'active',
  '{"voice": true, "sms": true}'::jsonb,
  'Halla AI Main Line — Dubai'
FROM public.voice_tenants vt
WHERE vt.phone_number = '+97145551234'
  AND NOT EXISTS (
    SELECT 1 FROM public.tenant_phone_numbers tpn
    WHERE tpn.phone_number = '+97145551234'
  );

-- 3. Verify the data
SELECT '=== TENANTS ===' AS info;
SELECT id, company_name, phone_number, call_handling_mode, voice_tone, currency, timezone
FROM public.voice_tenants
WHERE phone_number = '+97145551234';

SELECT '=== PHONE NUMBERS ===' AS info;
SELECT tpn.id, tpn.phone_number, tpn.status, vt.company_name
FROM public.tenant_phone_numbers tpn
JOIN public.voice_tenants vt ON vt.id = tpn.tenant_id
WHERE tpn.phone_number = '+97145551234';

SELECT '=== TEST LOOKUP ===' AS info;
SELECT * FROM public.get_tenant_by_phone_number('+97145551234');
