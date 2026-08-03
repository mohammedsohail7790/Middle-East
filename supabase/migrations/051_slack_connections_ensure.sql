-- Migration 051: Ensure slack_connections works with voice_tenants OAuth
-- Safe to re-run. Fixes cases where 050 rolled back on FK add.

CREATE TABLE IF NOT EXISTS public.slack_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  webhook_url TEXT,
  channel TEXT NOT NULL DEFAULT '#general',
  access_token TEXT,
  team_name TEXT,
  enabled BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.slack_connections
  ADD COLUMN IF NOT EXISTS access_token TEXT,
  ADD COLUMN IF NOT EXISTS team_name TEXT,
  ADD COLUMN IF NOT EXISTS webhook_url TEXT,
  ADD COLUMN IF NOT EXISTS channel TEXT,
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.slack_connections
  ALTER COLUMN webhook_url DROP NOT NULL;

UPDATE public.slack_connections
SET channel = COALESCE(NULLIF(TRIM(channel), ''), '#general')
WHERE channel IS NULL OR TRIM(channel) = '';

ALTER TABLE public.slack_connections
  ALTER COLUMN channel SET DEFAULT '#general';

-- Remove rows that cannot reference voice_tenants (blocks FK add)
DELETE FROM public.slack_connections sc
WHERE NOT EXISTS (
  SELECT 1 FROM public.voice_tenants vt WHERE vt.id = sc.tenant_id
);

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'slack_connections'
      AND constraint_type = 'FOREIGN KEY'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.slack_connections DROP CONSTRAINT IF EXISTS %I',
      r.constraint_name
    );
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'slack_connections'
      AND constraint_name = 'slack_connections_tenant_id_fkey'
  ) THEN
    ALTER TABLE public.slack_connections
      ADD CONSTRAINT slack_connections_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.voice_tenants(id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS slack_connections_tenant_id_key
  ON public.slack_connections(tenant_id);

CREATE INDEX IF NOT EXISTS idx_slack_connections_tenant
  ON public.slack_connections(tenant_id);

ALTER TABLE public.slack_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "slack_connections_service_role" ON public.slack_connections;
CREATE POLICY "slack_connections_service_role"
  ON public.slack_connections FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'user_can_access_tenant'
  ) THEN
    DROP POLICY IF EXISTS "slack_connections_tenant_access" ON public.slack_connections;
    CREATE POLICY "slack_connections_tenant_access"
      ON public.slack_connections FOR ALL
      TO authenticated
      USING (public.user_can_access_tenant(tenant_id))
      WITH CHECK (public.user_can_access_tenant(tenant_id));
  END IF;
END;
$$;
