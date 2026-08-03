-- Production bootstrap (create-ai-config-table.cjs) used JSONB for list columns;
-- migration 007 used TEXT[]. Normalize to JSONB so app bindings stay consistent.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ai_agent_configs'
      AND column_name = 'do_instructions'
      AND udt_name = '_text'
  ) THEN
    ALTER TABLE public.ai_agent_configs
      ALTER COLUMN services_offered TYPE jsonb USING to_jsonb(services_offered),
      ALTER COLUMN service_areas TYPE jsonb USING to_jsonb(service_areas),
      ALTER COLUMN required_fields TYPE jsonb USING to_jsonb(required_fields),
      ALTER COLUMN optional_fields TYPE jsonb USING to_jsonb(optional_fields),
      ALTER COLUMN do_instructions TYPE jsonb USING to_jsonb(do_instructions),
      ALTER COLUMN dont_instructions TYPE jsonb USING to_jsonb(dont_instructions);
  END IF;
END $$;
