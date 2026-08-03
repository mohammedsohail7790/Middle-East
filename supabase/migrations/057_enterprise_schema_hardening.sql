-- Migration 057: Enterprise schema hardening — repoint any remaining public.tenants FKs
-- Safe to run on existing databases; no-op when constraints are already correct.

DO $$
DECLARE
  r RECORD;
  tbl TEXT;
  tables_with_tenant_fk TEXT[] := ARRAY[
    'slack_connections',
    'lead_routing_rules',
    'ai_agent_configs',
    'ai_prompt_templates',
    'ai_conversation_scenarios',
    'ai_training_examples',
    'ai_performance_metrics',
    'knowledge_files',
    'call_costs',
    'cost_alerts',
    'onboarding_progress'
  ];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'voice_tenants'
  ) THEN
    RAISE NOTICE 'voice_tenants missing — apply base schema before migration 057';
    RETURN;
  END IF;

  FOREACH tbl IN ARRAY tables_with_tenant_fk LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      CONTINUE;
    END IF;

    FOR r IN
      SELECT tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.table_name = tbl
        AND tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = 'tenants'
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', tbl, r.constraint_name);
    END LOOP;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.table_name = tbl
        AND tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = 'voice_tenants'
    ) THEN
      BEGIN
        EXECUTE format(
          'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES public.voice_tenants(id) ON DELETE CASCADE',
          tbl,
          tbl || '_tenant_id_fkey'
        );
      EXCEPTION WHEN duplicate_object THEN
        NULL;
      END;
    END IF;
  END LOOP;
END;
$$;
