-- Fix slack_connections for Call IQ OAuth (voice_tenants FK + optional OAuth columns)

DO $$
DECLARE
  r RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'slack_connections'
  ) THEN
    RETURN;
  END IF;

  -- Repoint broken public.tenants FK → voice_tenants (see 045_fix_ghost_tenants_fk.sql)
  FOR r IN
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'slack_connections'
      AND constraint_type = 'FOREIGN KEY'
  LOOP
    EXECUTE format('ALTER TABLE public.slack_connections DROP CONSTRAINT IF EXISTS %I', r.constraint_name);
  END LOOP;

  ALTER TABLE public.slack_connections
    ADD CONSTRAINT slack_connections_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.voice_tenants(id) ON DELETE CASCADE;

  ALTER TABLE public.slack_connections
    ADD COLUMN IF NOT EXISTS access_token TEXT,
    ADD COLUMN IF NOT EXISTS team_name TEXT;

  -- OAuth callback may run before webhook is persisted in edge cases
  ALTER TABLE public.slack_connections
    ALTER COLUMN webhook_url DROP NOT NULL;
END;
$$;
