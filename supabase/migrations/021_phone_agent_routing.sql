-- Phone number → AI agent routing (bootstrap ai_agents if migration 012 was never applied)

-- ============================================================================
-- 1. ai_agents table (from 012)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ai_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL,
  system_prompt text NOT NULL,
  voice_id text,
  tone text DEFAULT 'professional',
  services text[] DEFAULT '{}'::text[],
  max_duration_seconds integer DEFAULT 600,
  transfer_on_timeout boolean DEFAULT false,
  transfer_number text,
  knowledge_category text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_agents_tenant ON public.ai_agents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_agents_role ON public.ai_agents(tenant_id, role);

ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage AI agents" ON public.ai_agents;
DROP POLICY IF EXISTS ai_agents_tenant_owner ON public.ai_agents;
CREATE POLICY ai_agents_tenant_owner ON public.ai_agents
  FOR ALL USING (
    tenant_id IN (SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid())
  );

-- ============================================================================
-- 2. tenant_phone_numbers (minimal bootstrap if 010 missing)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tenant_phone_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  phone_number text NOT NULL UNIQUE,
  twilio_sid text NOT NULL UNIQUE,
  status text DEFAULT 'active',
  capabilities jsonb DEFAULT '{}'::jsonb,
  friendly_name text,
  purchased_at timestamptz DEFAULT now(),
  monthly_cost numeric DEFAULT 1.15,
  webhook_url text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_phone_numbers_tenant
  ON public.tenant_phone_numbers(tenant_id);

-- ============================================================================
-- 3. Link phone numbers to agents
-- ============================================================================
ALTER TABLE public.tenant_phone_numbers
  ADD COLUMN IF NOT EXISTS ai_agent_id uuid;

ALTER TABLE public.tenant_phone_numbers
  DROP CONSTRAINT IF EXISTS tenant_phone_numbers_ai_agent_id_fkey;

ALTER TABLE public.tenant_phone_numbers
  ADD CONSTRAINT tenant_phone_numbers_ai_agent_id_fkey
  FOREIGN KEY (ai_agent_id) REFERENCES public.ai_agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_phone_numbers_agent
  ON public.tenant_phone_numbers (ai_agent_id)
  WHERE ai_agent_id IS NOT NULL;

-- ============================================================================
-- 4. Lookup function (returns agent for dialed number)
-- Must drop first when adding ai_agent_id to return type (Postgres 42P13).
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_tenant_by_phone_number(text);

CREATE OR REPLACE FUNCTION public.get_tenant_by_phone_number(p_phone_number text)
RETURNS TABLE (
  tenant_id uuid,
  company_name text,
  phone_number text,
  number_id uuid,
  ai_agent_id uuid
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vt.id,
    vt.company_name,
    tpn.phone_number,
    tpn.id,
    tpn.ai_agent_id
  FROM public.tenant_phone_numbers tpn
  JOIN public.voice_tenants vt ON vt.id = tpn.tenant_id
  WHERE tpn.phone_number = p_phone_number
    AND tpn.status = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      vt.id,
      vt.company_name,
      vt.phone_number,
      NULL::uuid,
      NULL::uuid
    FROM public.voice_tenants vt
    WHERE vt.phone_number = p_phone_number
    LIMIT 1;
  END IF;
END;
$$;
