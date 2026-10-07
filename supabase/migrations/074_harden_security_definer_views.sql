-- 074_harden_security_definer_views.sql
--
-- The three views in `public` were flagged by Supabase's Advisor as SECURITY DEFINER. They are owned by `postgres`, which
-- bypasses RLS, and on Supabase every new table/view in `public` is granted ALL privileges to anon, authenticated and
-- service_role by default (the Data API is on and exposes `public`). Verified on the Halla staging project:
--
--   integration_status    SELECT of every voice_tenants row (tenant id, company name, which CRMs are connected)
--   v_tenant_me_channels  every GCC/MENA tenant with its WhatsApp display number and channel status
--   known_feature_flags   a static VALUES list (no tenant data)
--
-- all with arwdDxtm for anon, authenticated and service_role. Demonstrated on a throwaway database with the same grants:
-- an anonymous caller could read every tenant through the first two, and, because `integration_status` is a simple
-- single-table (auto-updatable) view running as the RLS-bypassing owner, could UPDATE and DELETE tenant rows through it.
-- Direct access to voice_tenants was correctly denied; the views were the way around RLS.
--
-- What this does:
--   1. integration_status and v_tenant_me_channels: security_invoker = true. They then run with the CALLER's rights, so
--      RLS on voice_tenants / whatsapp_connections / channel_connections applies to whoever queries them. (The definitions
--      are untouched. known_feature_flags reads no table, so there is nothing for security_invoker to filter.)
--   2. All three views: every privilege revoked from PUBLIC, anon and authenticated. Nothing in the gateway, the dashboard
--      or any script reads them (searched), and migration 065 granted v_tenant_me_channels to service_role only
--      ("Grant read to service role"); the other two never stated a grant.
--   3. service_role (the machine-access role) keeps exactly SELECT: its write and other privileges on views are removed
--      because a read-only reporting view has no use for them.
--
-- Defense in depth: even if a later change re-granted SELECT to authenticated, security_invoker keeps the result tenant-scoped.
-- If a view is ever meant to be client-readable it must be added deliberately (the catalog audit in tests/helpers/rls-audit.ts
-- fails on any API-role access to a public view).
--
-- Robustness: each view is handled only if it exists and is a plain view (some older databases have `integration_status`
-- as a TABLE, which has its own RLS policies and is left alone). Idempotent: ALTER ... SET and REVOKE/GRANT repeat safely.
-- Needs PostgreSQL 15+ for security_invoker (Supabase is 17). Forward-only like every migration here.

DO $$
DECLARE
  v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['integration_status', 'v_tenant_me_channels', 'known_feature_flags'] LOOP
    IF EXISTS (SELECT 1 FROM pg_class c WHERE c.oid = to_regclass(format('public.%I', v)) AND c.relkind = 'v') THEN
      IF v IN ('integration_status', 'v_tenant_me_channels') THEN
        EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v);
      END IF;
      EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', v);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', v);
      -- REVOKE ALL + GRANT SELECT (not a list of named privileges) so the result is the same on PostgreSQL 16 and 17,
      -- which has the extra MAINTAIN privilege. Both run inside this migration's transaction: service_role never loses SELECT.
      EXECUTE format('REVOKE ALL ON public.%I FROM service_role', v);
      EXECUTE format('GRANT SELECT ON public.%I TO service_role', v);
    END IF;
  END LOOP;
END $$;
