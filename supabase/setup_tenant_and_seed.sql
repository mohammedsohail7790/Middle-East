-- =====================================================
-- Halla AI — Full tenant bootstrap + seed
-- Run this entire script in Supabase Dashboard > SQL Editor
-- Creates: tenant_phone_numbers table, lookup function, and GCC demo tenant
-- Market: GCC / Middle East | Domain: hallaai.com
-- =====================================================

-- 1. TENANT PHONE NUMBERS TABLE
CREATE TABLE IF NOT EXISTS public.tenant_phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  phone_number TEXT NOT NULL UNIQUE,
  twilio_sid TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'releasing', 'released')),
  capabilities JSONB DEFAULT '{}'::JSONB,
  friendly_name TEXT,
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  monthly_cost NUMERIC DEFAULT 1.15,
  webhook_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_phone_numbers_tenant ON public.tenant_phone_numbers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_phone_numbers_number ON public.tenant_phone_numbers(phone_number);
CREATE INDEX IF NOT EXISTS idx_tenant_phone_numbers_status ON public.tenant_phone_numbers(status) WHERE status = 'active';

ALTER TABLE public.tenant_phone_numbers ENABLE ROW LEVEL SECURITY;

-- 2. PHONE NUMBER LOGS TABLE
CREATE TABLE IF NOT EXISTS public.phone_number_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('purchased', 'released', 'webhook_updated', 'failed')),
  phone_number TEXT,
  twilio_sid TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phone_number_logs_tenant ON public.phone_number_logs(tenant_id);
ALTER TABLE public.phone_number_logs ENABLE ROW LEVEL SECURITY;

-- 3. LOOKUP FUNCTION
DROP FUNCTION IF EXISTS public.get_tenant_by_phone_number(text);

CREATE OR REPLACE FUNCTION get_tenant_by_phone_number(p_phone_number TEXT)
RETURNS TABLE (
  tenant_id UUID,
  company_name TEXT,
  phone_number TEXT,
  number_id UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    vt.id,
    vt.company_name,
    tpn.phone_number,
    tpn.id
  FROM public.tenant_phone_numbers tpn
  JOIN public.voice_tenants vt ON vt.id = tpn.tenant_id
  WHERE tpn.phone_number = p_phone_number
    AND tpn.status = 'active'
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT 
      vt.id,
      vt.company_name,
      vt.phone_number,
      NULL::UUID
    FROM public.voice_tenants vt
    WHERE vt.phone_number = p_phone_number
    LIMIT 1;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 4. DEMO TENANT — GCC / UAE (skip if already exists)
-- Phone: +971 4 555 1234 (Dubai dummy number)
-- Language: Arabic | Timezone: Asia/Dubai | Currency: AED
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
  '+97145551234',
  'ar',
  'Asia/Dubai',
  'AED',
  0,
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

-- 5. LINK THE PHONE NUMBER
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

-- 6. VERIFY
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
