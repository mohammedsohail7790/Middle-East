-- Migration 010: Multi-Number Phone Provisioning
-- Created: 2026-05-06
-- Description: Support multiple phone numbers per tenant with auto-provisioning

-- =====================================================
-- 1. TENANT PHONE NUMBERS — Allow multiple numbers per tenant
-- =====================================================

CREATE TABLE IF NOT EXISTS public.tenant_phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  phone_number TEXT NOT NULL UNIQUE,
  twilio_sid TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'releasing', 'released')),
  capabilities JSONB DEFAULT '{}'::JSONB, -- {voice: true, sms: true, mms: true}
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

CREATE POLICY "Users can view their tenant's phone numbers"
  ON public.tenant_phone_numbers FOR SELECT
  USING (tenant_id IN (SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid()));

CREATE POLICY "Admins can manage phone numbers"
  ON public.tenant_phone_numbers FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  ));

-- =====================================================
-- 2. PHONE NUMBER PURCHASE LOG — Audit trail
-- =====================================================

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

CREATE POLICY "System can insert phone number logs"
  ON public.phone_number_logs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can view phone number logs"
  ON public.phone_number_logs FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  ));

-- =====================================================
-- 3. HELPER FUNCTION — Get tenant by any of their phone numbers
-- =====================================================

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
  
  -- Fallback to legacy single-number lookup
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

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE public.tenant_phone_numbers IS 'Multiple phone numbers per tenant with Twilio provisioning';
COMMENT ON TABLE public.phone_number_logs IS 'Audit log for phone number purchases and releases';
COMMENT ON FUNCTION get_tenant_by_phone_number IS 'Resolve tenant from any of their active phone numbers';
