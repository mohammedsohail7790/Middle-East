-- Migration 045: Fix ghost public.tenants FK references
-- Several migrations (006, 007, 018, 019) created tables referencing public.tenants
-- which does not exist. The real table is public.voice_tenants.
-- This migration drops the broken constraints and re-adds them correctly.

-- Helper: only drop/add constraint if table exists
DO $$
DECLARE
  r RECORD;
BEGIN

  -- onboarding_progress (from 019_onboarding_progress.sql)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'onboarding_progress') THEN
    -- Drop any broken FK to public.tenants
    FOR r IN SELECT constraint_name FROM information_schema.table_constraints
              WHERE table_schema = 'public' AND table_name = 'onboarding_progress'
              AND constraint_type = 'FOREIGN KEY'
    LOOP
      EXECUTE format('ALTER TABLE public.onboarding_progress DROP CONSTRAINT IF EXISTS %I', r.constraint_name);
    END LOOP;

    -- Add correct FK to voice_tenants
    ALTER TABLE public.onboarding_progress
      ADD CONSTRAINT onboarding_progress_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.voice_tenants(id) ON DELETE CASCADE;
  END IF;

  -- call_costs (from 018_call_costs.sql)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'call_costs') THEN
    FOR r IN SELECT constraint_name FROM information_schema.table_constraints
              WHERE table_schema = 'public' AND table_name = 'call_costs'
              AND constraint_type = 'FOREIGN KEY'
    LOOP
      EXECUTE format('ALTER TABLE public.call_costs DROP CONSTRAINT IF EXISTS %I', r.constraint_name);
    END LOOP;

    ALTER TABLE public.call_costs
      ADD CONSTRAINT call_costs_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.voice_tenants(id) ON DELETE CASCADE;
  END IF;

  -- cost_alerts (from 018_call_costs.sql, if exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cost_alerts') THEN
    FOR r IN SELECT constraint_name FROM information_schema.table_constraints
              WHERE table_schema = 'public' AND table_name = 'cost_alerts'
              AND constraint_type = 'FOREIGN KEY'
    LOOP
      EXECUTE format('ALTER TABLE public.cost_alerts DROP CONSTRAINT IF EXISTS %I', r.constraint_name);
    END LOOP;

    ALTER TABLE public.cost_alerts
      ADD CONSTRAINT cost_alerts_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.voice_tenants(id) ON DELETE CASCADE;
  END IF;

END;
$$;
