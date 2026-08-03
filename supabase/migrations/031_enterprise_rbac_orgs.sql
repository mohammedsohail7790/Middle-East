-- P4-B: Organizations, teams, enterprise RBAC

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.org_tenants (
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  PRIMARY KEY (org_id, tenant_id)
);

CREATE TABLE IF NOT EXISTS public.org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'operator'
    CHECK (role IN ('owner', 'admin', 'manager', 'operator', 'analyst', 'readonly')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_tenant ON public.org_members(tenant_id);

CREATE TABLE IF NOT EXISTS public.enterprise_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  actor_id UUID,
  actor_email TEXT,
  resource_type TEXT,
  resource_id TEXT,
  payload JSONB DEFAULT '{}'::JSONB,
  correlation_id TEXT,
  causation_id TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_enterprise_audit_tenant_time
  ON public.enterprise_audit_events(tenant_id, created_at DESC);

ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_audit_events ENABLE ROW LEVEL SECURITY;
