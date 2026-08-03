-- 064_gcc_phase1_skeleton.sql
-- Phase 1 GCC platform skeleton: additive schema only.
-- Adds per-agent config columns, tenant currency, CRM tables, and the
-- channel-connection status table. No existing table/column is modified.

-- 1. Per-agent GCC config (ai_agents already exists, migration 012/021)
ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS industry TEXT,
  ADD COLUMN IF NOT EXISTS business_hours JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS escalation_rules JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS greeting TEXT,
  ADD COLUMN IF NOT EXISTS fallback_message TEXT;

-- 2. Tenant currency (voice_tenants.industry/timezone already exist, migration 014/008)
ALTER TABLE public.voice_tenants
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';

-- 3. CRM skeleton tables
CREATE TABLE IF NOT EXISTS public.crm_pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_pipeline_stages_tenant ON public.crm_pipeline_stages(tenant_id);
ALTER TABLE public.crm_pipeline_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage pipeline stages"
  ON public.crm_pipeline_stages FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
  ));

CREATE TABLE IF NOT EXISTS public.crm_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  website TEXT,
  industry TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_companies_tenant ON public.crm_companies(tenant_id);
ALTER TABLE public.crm_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage companies"
  ON public.crm_companies FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
  ));

CREATE TABLE IF NOT EXISTS public.crm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  company_id UUID REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_tenant ON public.crm_contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_company ON public.crm_contacts(company_id);
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage contacts"
  ON public.crm_contacts FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
  ));

CREATE TABLE IF NOT EXISTS public.crm_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  stage_id UUID REFERENCES public.crm_pipeline_stages(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  value NUMERIC(12, 2) DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_deals_tenant ON public.crm_deals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_stage ON public.crm_deals(stage_id);
ALTER TABLE public.crm_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage deals"
  ON public.crm_deals FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
  ));

-- 4. Channel connection status (structural home for later WhatsApp/IG/FB wiring)
CREATE TABLE IF NOT EXISTS public.channel_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'web_chat', 'instagram', 'facebook')),
  status TEXT NOT NULL DEFAULT 'not_connected' CHECK (status IN ('not_connected', 'connected', 'error')),
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, channel)
);
CREATE INDEX IF NOT EXISTS idx_channel_connections_tenant ON public.channel_connections(tenant_id);
ALTER TABLE public.channel_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage channel connections"
  ON public.channel_connections FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
  ));
