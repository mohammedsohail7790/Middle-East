-- Ensure automation_rules exists for dashboard workflow page
CREATE TABLE IF NOT EXISTS public.automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  action TEXT NOT NULL,
  template TEXT,
  delay INTEGER DEFAULT 0,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_rules_tenant ON public.automation_rules(tenant_id);

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
