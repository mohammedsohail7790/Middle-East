-- Migration 011: RLS Policies for Core Tables
-- Created: 2026-05-06
-- Description: Add Row-Level Security to calls, leads, appointments, and voice_tenants

-- =====================================================
-- 1. CALLS — RLS policies
-- =====================================================

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's calls"
  ON public.calls FOR SELECT
  USING (tenant_id IN (SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid()));

CREATE POLICY "Admins can manage calls"
  ON public.calls FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  ));

CREATE POLICY "System can insert calls"
  ON public.calls FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update calls"
  ON public.calls FOR UPDATE
  USING (true);

-- =====================================================
-- 2. LEADS — RLS policies
-- =====================================================

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's leads"
  ON public.leads FOR SELECT
  USING (tenant_id IN (SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid()));

CREATE POLICY "Admins can manage leads"
  ON public.leads FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  ));

CREATE POLICY "System can insert leads"
  ON public.leads FOR INSERT
  WITH CHECK (true);

-- =====================================================
-- 3. APPOINTMENTS — RLS policies
-- =====================================================

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's appointments"
  ON public.appointments FOR SELECT
  USING (tenant_id IN (SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid()));

CREATE POLICY "Admins can manage appointments"
  ON public.appointments FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  ));

CREATE POLICY "System can insert appointments"
  ON public.appointments FOR INSERT
  WITH CHECK (true);

-- =====================================================
-- 4. VOICE_TENANTS — RLS policies
-- =====================================================

ALTER TABLE public.voice_tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own tenant"
  ON public.voice_tenants FOR SELECT
  USING (owner_user_id = auth.uid() OR id IN (
    SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Owners can update their tenant"
  ON public.voice_tenants FOR UPDATE
  USING (owner_user_id = auth.uid());

CREATE POLICY "Service role can manage tenants"
  ON public.voice_tenants FOR ALL
  USING (true);

-- =====================================================
-- 5. SMS_CONVERSATIONS — RLS policies (if not already present)
-- =====================================================

ALTER TABLE public.sms_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's sms conversations"
  ON public.sms_conversations FOR SELECT
  USING (tenant_id IN (SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid()));

CREATE POLICY "Admins can manage sms conversations"
  ON public.sms_conversations FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  ));

-- =====================================================
-- 6. INTEGRATION_STATUS — RLS policies (if not already present)
-- =====================================================

ALTER TABLE public.integration_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's integration status"
  ON public.integration_status FOR SELECT
  USING (tenant_id IN (SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid()));

CREATE POLICY "Admins can manage integration status"
  ON public.integration_status FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  ));

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON POLICY "Users can view their tenant's calls" ON public.calls IS 'Users see only calls from their tenant';
COMMENT ON POLICY "Users can view their tenant's leads" ON public.leads IS 'Users see only leads from their tenant';
COMMENT ON POLICY "Users can view their tenant's appointments" ON public.appointments IS 'Users see only appointments from their tenant';
COMMENT ON POLICY "Users can view their own tenant" ON public.voice_tenants IS 'Users can only see their own tenant or tenants they are team members of';
