-- Migration 042: Add RLS to tables created in 041 without policies
-- These tables contain sensitive data (HIPAA BAA, SLA, port requests)

-- Helper function (idempotent — already exists from 029 but create if not exists)
CREATE OR REPLACE FUNCTION public.user_can_access_tenant(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.voice_tenants vt
    WHERE vt.id = p_tenant_id AND vt.owner_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.tenant_id = p_tenant_id AND tm.user_id = auth.uid()
  );
$$;

-- ─── tenant_spam_settings ─────────────────────────────────────────────────────
ALTER TABLE public.tenant_spam_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "spam_settings_tenant_access" ON public.tenant_spam_settings;
CREATE POLICY "spam_settings_tenant_access"
  ON public.tenant_spam_settings FOR ALL
  TO authenticated
  USING (public.user_can_access_tenant(tenant_id))
  WITH CHECK (public.user_can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "spam_settings_service_write" ON public.tenant_spam_settings;
CREATE POLICY "spam_settings_service_write"
  ON public.tenant_spam_settings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── baa_agreements ───────────────────────────────────────────────────────────
ALTER TABLE public.baa_agreements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baa_owner_access" ON public.baa_agreements;
CREATE POLICY "baa_owner_access"
  ON public.baa_agreements FOR SELECT
  TO authenticated
  USING (public.user_can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "baa_owner_insert" ON public.baa_agreements;
CREATE POLICY "baa_owner_insert"
  ON public.baa_agreements FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_can_access_tenant(tenant_id)
    AND EXISTS (
      SELECT 1 FROM public.voice_tenants vt
      WHERE vt.id = tenant_id AND vt.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "baa_service_role" ON public.baa_agreements;
CREATE POLICY "baa_service_role"
  ON public.baa_agreements FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── phone_port_requests ──────────────────────────────────────────────────────
ALTER TABLE public.phone_port_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "port_requests_tenant_access" ON public.phone_port_requests;
CREATE POLICY "port_requests_tenant_access"
  ON public.phone_port_requests FOR SELECT
  TO authenticated
  USING (public.user_can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "port_requests_owner_write" ON public.phone_port_requests;
CREATE POLICY "port_requests_owner_write"
  ON public.phone_port_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.voice_tenants vt
      WHERE vt.id = tenant_id AND vt.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "port_requests_owner_update" ON public.phone_port_requests;
CREATE POLICY "port_requests_owner_update"
  ON public.phone_port_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.voice_tenants vt
      WHERE vt.id = tenant_id AND vt.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "port_requests_service_role" ON public.phone_port_requests;
CREATE POLICY "port_requests_service_role"
  ON public.phone_port_requests FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── enterprise_accounts ──────────────────────────────────────────────────────
ALTER TABLE public.enterprise_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "enterprise_accounts_tenant_access" ON public.enterprise_accounts;
CREATE POLICY "enterprise_accounts_tenant_access"
  ON public.enterprise_accounts FOR SELECT
  TO authenticated
  USING (public.user_can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "enterprise_accounts_service_role" ON public.enterprise_accounts;
CREATE POLICY "enterprise_accounts_service_role"
  ON public.enterprise_accounts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── sla_credit_events ────────────────────────────────────────────────────────
ALTER TABLE public.sla_credit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sla_credits_tenant_access" ON public.sla_credit_events;
CREATE POLICY "sla_credits_tenant_access"
  ON public.sla_credit_events FOR SELECT
  TO authenticated
  USING (public.user_can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "sla_credits_service_role" ON public.sla_credit_events;
CREATE POLICY "sla_credits_service_role"
  ON public.sla_credit_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
