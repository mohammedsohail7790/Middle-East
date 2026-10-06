-- Migration 072: Halla RLS hardening (recursion + cross-tenant `true` policies + RLS-less tenant tables)
-- Created: 2026-10-06
--
-- WHY (found by exercising the real policies as a non-superuser, non-BYPASSRLS role):
--
--   1. RECURSION. voice_tenants' "Users can view their own tenant" selects from team_members, and team_members'
--      policies select from voice_tenants, so PostgreSQL aborts with "infinite recursion detected in policy for
--      relation ...". 55 tables carry policies that subquery voice_tenants/team_members, so every one of them failed
--      the same way for any role that does not bypass RLS (ai_agents, ai_agent_configs, leads, calls, ...).
--      Access failed CLOSED, but a legitimate owner could not read their own rows through RLS either.
--
--   2. CROSS-TENANT `true` POLICIES, granted to PUBLIC (so also to anon, whose key ships in the browser):
--        voice_tenants            "Service role can manage tenants"   FOR ALL USING (true)     -> any role could read/write EVERY tenant
--                                                                                                (company, phone, transfer/escalation number)
--        invoices                 "System can manage invoices"        FOR ALL WITH CHECK (true)  -> USING defaults to the check: read/modify ALL invoices
--        knowledge_base           "...can delete knowledge"           FOR DELETE USING (true)    -> delete any tenant's knowledge
--        knowledge_base           "...can insert knowledge"           FOR INSERT WITH CHECK (true)
--        knowledge_ingestion_runs "Service connections can manage..." FOR ALL true               -> read/write all
--        audit_logs, ai_performance_metrics, call_evaluations, integration_audit_log, phone_number_logs, usage_records
--                                 "System can insert ..."             FOR INSERT WITH CHECK (true) -> any role could forge rows for any tenant
--      The service role bypasses RLS, and the gateway connects with a privileged role, so none of these policies was
--      needed for the application to work; they only widened access.
--
--   3. TENANT TABLES WITHOUT RLS: call_quality_scores, call_spam_log, integration_sync_state, enterprise_auth_sessions,
--      scim_directory_users carry tenant_id but had RLS switched off.
--
-- FIX
--   * Two narrowly scoped SECURITY DEFINER helpers break the cycle (user_can_access_tenant, from migration 029, already
--     does the same for "owner or member"). Each one: reads ONLY voice_tenants/team_members, takes ONE uuid, returns a
--     boolean about the CALLER (auth.uid()), pins search_path to pg_catalog + public, is STABLE, and is executable only
--     by authenticated/service_role. It cannot return rows, so it cannot leak data; because it runs as the table owner it
--     does not re-enter the RLS policies it is called from, which is what removes the recursion.
--   * voice_tenants and team_members policies are rewritten to use the helpers (no table subqueries). Once those two are
--     non-recursive, the other 53 tables' existing policies evaluate correctly.
--   * ai_agents / ai_agent_configs: legacy inline policies replaced/removed (same intended access, no recursion).
--   * Every cross-tenant `true` policy above is dropped, and the six INSERT policies are replaced by a tenant-scoped check.
--   * RLS is enabled on the five tables above; members may read the three operational ones, the two auth/SCIM tables are
--     deny-by-default (service role only).
--
-- NOT DONE ON PURPOSE: RLS is not disabled anywhere, no role is given BYPASSRLS, no `true` policy is added, and tenant
-- filtering is not left to application code. Within-tenant role differences (e.g. any team member may write
-- ai_agent_configs, per migration 029) are unchanged: this migration is about tenant boundaries.
--
-- ROLLBACK: there is intentionally no down-migration, because it would have to recreate the vulnerable policies.
-- Idempotent: safe to re-run (DROP POLICY IF EXISTS / CREATE OR REPLACE / IF NOT EXISTS guards; tables are checked with to_regclass).

-- =====================================================
-- 1. Helpers (non-recursive, narrowly scoped)
-- =====================================================

CREATE OR REPLACE FUNCTION public.user_is_tenant_owner(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.voice_tenants vt
    WHERE vt.id = p_tenant_id AND vt.owner_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.user_is_tenant_admin(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.voice_tenants vt
    WHERE vt.id = p_tenant_id AND vt.owner_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.tenant_id = p_tenant_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin')
  );
$$;

-- Same semantics as migration 029's helper (owner OR team member). Re-stated here so this migration does not depend on
-- 029 having been applied: the legacy policies dropped below are replaced by policies that call it.
CREATE OR REPLACE FUNCTION public.user_can_access_tenant(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
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

REVOKE ALL ON FUNCTION public.user_is_tenant_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_is_tenant_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_is_tenant_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_is_tenant_admin(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.user_is_tenant_owner(uuid) IS
  'RLS helper (migration 072): true when the CALLER owns the tenant. SECURITY DEFINER only to avoid policy recursion; returns a boolean about auth.uid(), never rows.';
COMMENT ON FUNCTION public.user_is_tenant_admin(uuid) IS
  'RLS helper (migration 072): true when the CALLER owns the tenant or is an owner/admin team member. SECURITY DEFINER only to avoid policy recursion; returns a boolean about auth.uid(), never rows.';

-- =====================================================
-- 2. voice_tenants (the root of the recursion + the PUBLIC USING (true) policy)
-- =====================================================

DROP POLICY IF EXISTS "Service role can manage tenants" ON public.voice_tenants;   -- USING (true) for PUBLIC
DROP POLICY IF EXISTS "Users can view their own tenant" ON public.voice_tenants;   -- recursive; superseded by voice_tenants_select_member (migration 029)
DROP POLICY IF EXISTS voice_tenants_update_owner_admin ON public.voice_tenants;    -- inline team_members subquery

CREATE POLICY voice_tenants_update_owner_admin ON public.voice_tenants
  FOR UPDATE TO authenticated
  USING (public.user_is_tenant_admin(id))
  WITH CHECK (public.user_is_tenant_admin(id));

-- The replacement for the dropped "Users can view their own tenant": owner OR team member (same as migration 029).
DROP POLICY IF EXISTS voice_tenants_select_member ON public.voice_tenants;
CREATE POLICY voice_tenants_select_member ON public.voice_tenants
  FOR SELECT TO authenticated
  USING (public.user_can_access_tenant(id));

-- "Owners can update their tenant" and "Users can manage own voice tenants" (owner_user_id = auth.uid()) are
-- non-recursive and are kept.

-- =====================================================
-- 3. team_members (the other half of the cycle)
-- =====================================================

DROP POLICY IF EXISTS "Users can view their tenant's team members" ON public.team_members;
DROP POLICY IF EXISTS "Users can manage their tenant's team members" ON public.team_members;
DROP POLICY IF EXISTS team_members_select_tenant ON public.team_members;
DROP POLICY IF EXISTS team_members_manage_owner ON public.team_members;

CREATE POLICY team_members_select_tenant ON public.team_members
  FOR SELECT TO authenticated
  USING (public.user_can_access_tenant(tenant_id));

-- Only the tenant OWNER manages the team (as before): an admin must not be able to add or promote admins.
CREATE POLICY team_members_manage_owner ON public.team_members
  FOR ALL TO authenticated
  USING (public.user_is_tenant_owner(tenant_id))
  WITH CHECK (public.user_is_tenant_owner(tenant_id));

-- =====================================================
-- 4. ai_agents / ai_agent_configs
-- =====================================================

DROP POLICY IF EXISTS ai_agents_tenant_owner ON public.ai_agents;                  -- inline voice_tenants subquery, PUBLIC
DROP POLICY IF EXISTS ai_agents_owner_manage ON public.ai_agents;
CREATE POLICY ai_agents_owner_manage ON public.ai_agents
  FOR ALL TO authenticated
  USING (public.user_is_tenant_owner(tenant_id))
  WITH CHECK (public.user_is_tenant_owner(tenant_id));

-- Legacy inline team_members policies; migration 029's helper-based policies (ai_agent_configs_select_tenant /
-- ai_agent_configs_write_tenant) already grant the same access to owners and members, so nothing is lost.
DROP POLICY IF EXISTS "Admins can manage AI config" ON public.ai_agent_configs;
DROP POLICY IF EXISTS "Users can view their tenant's AI config" ON public.ai_agent_configs;
DROP POLICY IF EXISTS ai_agent_configs_select_tenant ON public.ai_agent_configs;
DROP POLICY IF EXISTS ai_agent_configs_write_tenant ON public.ai_agent_configs;
CREATE POLICY ai_agent_configs_select_tenant ON public.ai_agent_configs
  FOR SELECT TO authenticated USING (public.user_can_access_tenant(tenant_id));
CREATE POLICY ai_agent_configs_write_tenant ON public.ai_agent_configs
  FOR ALL TO authenticated
  USING (public.user_can_access_tenant(tenant_id)) WITH CHECK (public.user_can_access_tenant(tenant_id));

-- =====================================================
-- 5. Cross-tenant `true` policies
-- =====================================================

DROP POLICY IF EXISTS "System can manage invoices" ON public.invoices;
DROP POLICY IF EXISTS "Service role can delete knowledge" ON public.knowledge_base;
DROP POLICY IF EXISTS "Service role can insert knowledge" ON public.knowledge_base;
DROP POLICY IF EXISTS "Service connections can manage knowledge ingestion runs" ON public.knowledge_ingestion_runs;

-- INSERT policies that let any role forge a row for any tenant -> allowed only for a member of THAT tenant.
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('audit_logs',              'System can insert audit logs'),
      ('ai_performance_metrics',  'System can insert AI metrics'),
      ('call_evaluations',        'System can insert call evaluations'),
      ('integration_audit_log',   'Service role can insert audit logs'),
      ('phone_number_logs',       'System can insert phone number logs'),
      ('usage_records',           'System can insert usage records')
    ) AS t(tbl, pol)
  LOOP
    IF to_regclass('public.' || rec.tbl) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rec.pol, rec.tbl);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rec.tbl || '_insert_tenant', rec.tbl);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.user_can_access_tenant(tenant_id))',
        rec.tbl || '_insert_tenant', rec.tbl
      );
    END IF;
  END LOOP;
END $$;

-- =====================================================
-- 6. Tenant tables that had RLS switched off
-- =====================================================

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('call_quality_scores',     true),
      ('call_spam_log',           true),
      ('integration_sync_state',  true),
      ('enterprise_auth_sessions', false),  -- sessions: service role only
      ('scim_directory_users',    false)    -- directory data: service role only
    ) AS t(tbl, members_read)
  LOOP
    IF to_regclass('public.' || rec.tbl) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', rec.tbl);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rec.tbl || '_select_tenant', rec.tbl);
      IF rec.members_read THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.user_can_access_tenant(tenant_id))',
          rec.tbl || '_select_tenant', rec.tbl
        );
      END IF;
    END IF;
  END LOOP;
END $$;
