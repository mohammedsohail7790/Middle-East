-- Migration 043: Fix permissive RLS policies that expose cross-tenant data

-- ─── call_costs ──────────────────────────────────────────────────────────────
-- If the table exists (it may have broken FK to public.tenants), fix its RLS
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'call_costs') THEN
    ALTER TABLE public.call_costs ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "call_costs_service_select" ON public.call_costs;
    DROP POLICY IF EXISTS "call_costs_all" ON public.call_costs;

    CREATE POLICY "call_costs_tenant_select"
      ON public.call_costs FOR SELECT
      TO authenticated
      USING (public.user_can_access_tenant(tenant_id));

    CREATE POLICY "call_costs_service_role"
      ON public.call_costs FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;

-- ─── audit_logs (migration 012) — ensure service_role insert only ─────────────
-- The existing "System can insert audit logs" policy uses WITH CHECK (true) — this is correct
-- for the gateway's direct Postgres connection. Verify no SELECT bypass exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
    -- Ensure authenticated users can only read their own tenant's audit logs
    DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;

    CREATE POLICY "Admins can view audit logs"
      ON public.audit_logs FOR SELECT
      TO authenticated
      USING (
        tenant_id IN (
          SELECT tm.tenant_id FROM public.team_members tm
          WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin')
        )
      );
  END IF;
END;
$$;
