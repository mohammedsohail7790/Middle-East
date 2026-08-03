-- Migration 029: Call IQ V4 — RLS hardening (zero-trust tenant isolation)
-- Replaces permissive WITH CHECK (true) / USING (true) policies on core tables.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_jwt_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(auth.jwt() -> 'user_metadata' ->> 'tenant_id', '')::uuid,
    NULLIF(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid
  );
$$;

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

-- ---------------------------------------------------------------------------
-- CALLS
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "System can insert calls" ON public.calls;
DROP POLICY IF EXISTS "System can update calls" ON public.calls;
DROP POLICY IF EXISTS "Users can view their tenant's calls" ON public.calls;
DROP POLICY IF EXISTS "Admins can manage calls" ON public.calls;

CREATE POLICY "calls_select_tenant"
  ON public.calls FOR SELECT
  TO authenticated
  USING (public.user_can_access_tenant(tenant_id));

CREATE POLICY "calls_insert_tenant"
  ON public.calls FOR INSERT
  TO authenticated
  WITH CHECK (public.user_can_access_tenant(tenant_id));

CREATE POLICY "calls_update_tenant"
  ON public.calls FOR UPDATE
  TO authenticated
  USING (public.user_can_access_tenant(tenant_id))
  WITH CHECK (public.user_can_access_tenant(tenant_id));

-- ---------------------------------------------------------------------------
-- LEADS
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "System can insert leads" ON public.leads;
DROP POLICY IF EXISTS "Users can view their tenant's leads" ON public.leads;
DROP POLICY IF EXISTS "Admins can manage leads" ON public.leads;

CREATE POLICY "leads_select_tenant"
  ON public.leads FOR SELECT
  TO authenticated
  USING (public.user_can_access_tenant(tenant_id));

CREATE POLICY "leads_insert_tenant"
  ON public.leads FOR INSERT
  TO authenticated
  WITH CHECK (public.user_can_access_tenant(tenant_id));

CREATE POLICY "leads_update_tenant"
  ON public.leads FOR UPDATE
  TO authenticated
  USING (public.user_can_access_tenant(tenant_id))
  WITH CHECK (public.user_can_access_tenant(tenant_id));

-- ---------------------------------------------------------------------------
-- APPOINTMENTS
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "System can insert appointments" ON public.appointments;
DROP POLICY IF EXISTS "Users can view their tenant's appointments" ON public.appointments;
DROP POLICY IF EXISTS "Admins can manage appointments" ON public.appointments;

CREATE POLICY "appointments_select_tenant"
  ON public.appointments FOR SELECT
  TO authenticated
  USING (public.user_can_access_tenant(tenant_id));

CREATE POLICY "appointments_insert_tenant"
  ON public.appointments FOR INSERT
  TO authenticated
  WITH CHECK (public.user_can_access_tenant(tenant_id));

CREATE POLICY "appointments_update_tenant"
  ON public.appointments FOR UPDATE
  TO authenticated
  USING (public.user_can_access_tenant(tenant_id))
  WITH CHECK (public.user_can_access_tenant(tenant_id));

-- ---------------------------------------------------------------------------
-- VOICE TENANTS
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view own tenant" ON public.voice_tenants;
DROP POLICY IF EXISTS "Users can update own tenant" ON public.voice_tenants;
DROP POLICY IF EXISTS "Anyone can view tenants" ON public.voice_tenants;

CREATE POLICY "voice_tenants_select_member"
  ON public.voice_tenants FOR SELECT
  TO authenticated
  USING (public.user_can_access_tenant(id));

CREATE POLICY "voice_tenants_update_owner_admin"
  ON public.voice_tenants FOR UPDATE
  TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.tenant_id = voice_tenants.id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- AI AGENT CONFIGS (if table exists)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ai_agent_configs') THEN
    ALTER TABLE public.ai_agent_configs ENABLE ROW LEVEL SECURITY;
    EXECUTE 'DROP POLICY IF EXISTS "ai_agent_configs_tenant" ON public.ai_agent_configs';
    EXECUTE '
      CREATE POLICY "ai_agent_configs_select_tenant"
        ON public.ai_agent_configs FOR SELECT
        TO authenticated
        USING (public.user_can_access_tenant(tenant_id))';
    EXECUTE '
      CREATE POLICY "ai_agent_configs_write_tenant"
        ON public.ai_agent_configs FOR ALL
        TO authenticated
        USING (public.user_can_access_tenant(tenant_id))
        WITH CHECK (public.user_can_access_tenant(tenant_id))';
  END IF;
END $$;

COMMENT ON FUNCTION public.current_jwt_tenant_id IS 'Call IQ V4: tenant_id from Supabase JWT claims';
COMMENT ON FUNCTION public.user_can_access_tenant IS 'Call IQ V4: owner or team_members membership';
