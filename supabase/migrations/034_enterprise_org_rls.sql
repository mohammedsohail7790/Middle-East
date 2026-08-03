-- Migration 034: Enterprise org RLS policies (complements 031)
-- Includes tenant helper if migration 029 was not applied yet.

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

CREATE OR REPLACE FUNCTION public.user_can_access_org(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = p_org_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
  );
$$;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organizations_select_member" ON public.organizations;
CREATE POLICY "organizations_select_member"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (public.user_can_access_org(id));

DROP POLICY IF EXISTS "org_members_select_self_org" ON public.org_members;
CREATE POLICY "org_members_select_self_org"
  ON public.org_members FOR SELECT
  TO authenticated
  USING (public.user_can_access_org(org_id));

DROP POLICY IF EXISTS "org_members_insert_admin" ON public.org_members;
CREATE POLICY "org_members_insert_admin"
  ON public.org_members FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_can_access_org(org_id)
    AND EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = org_members.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
        AND om.status = 'active'
    )
  );

DROP POLICY IF EXISTS "org_tenants_select_member" ON public.org_tenants;
CREATE POLICY "org_tenants_select_member"
  ON public.org_tenants FOR SELECT
  TO authenticated
  USING (
    public.user_can_access_org(org_id)
    AND public.user_can_access_tenant(tenant_id)
  );

DROP POLICY IF EXISTS "enterprise_audit_select_tenant" ON public.enterprise_audit_events;
CREATE POLICY "enterprise_audit_select_tenant"
  ON public.enterprise_audit_events FOR SELECT
  TO authenticated
  USING (public.user_can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "enterprise_audit_insert_tenant" ON public.enterprise_audit_events;
CREATE POLICY "enterprise_audit_insert_tenant"
  ON public.enterprise_audit_events FOR INSERT
  TO authenticated
  WITH CHECK (public.user_can_access_tenant(tenant_id));
