-- =====================================================
-- Run this entire script in Supabase Dashboard > SQL Editor
-- Creates: tenant_phone_numbers table, lookup function, and demo tenant
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

-- 4. DEMO TENANT (skip if already exists)
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

-- 6. VERIFY
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
