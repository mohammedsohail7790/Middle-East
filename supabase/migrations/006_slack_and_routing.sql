-- Migration 006: Slack Integration and Lead Routing
-- Created: 2026-04-27
-- Description: Add Slack connections and lead routing rules tables

-- =====================================================
-- SLACK INTEGRATION
-- =====================================================

-- Slack connections table
CREATE TABLE IF NOT EXISTS public.slack_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  webhook_url TEXT NOT NULL,
  channel TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id)
);

-- Index for tenant lookups
CREATE INDEX IF NOT EXISTS idx_slack_connections_tenant 
  ON public.slack_connections(tenant_id);

-- RLS policies for slack_connections
ALTER TABLE public.slack_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's Slack connection"
  ON public.slack_connections FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid()
  ));

CREATE POLICY "Admins can manage Slack connections"
  ON public.slack_connections FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  ));

-- =====================================================
-- LEAD ROUTING
-- =====================================================

-- Lead routing rules table
CREATE TABLE IF NOT EXISTS public.lead_routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('round_robin', 'skill_based', 'load_balanced')),
  enabled BOOLEAN DEFAULT true,
  conditions JSONB,
  team_members TEXT[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for tenant lookups
CREATE INDEX IF NOT EXISTS idx_lead_routing_rules_tenant 
  ON public.lead_routing_rules(tenant_id);

-- Index for enabled rules
CREATE INDEX IF NOT EXISTS idx_lead_routing_rules_enabled 
  ON public.lead_routing_rules(tenant_id, enabled) 
  WHERE enabled = true;

-- RLS policies for lead_routing_rules
ALTER TABLE public.lead_routing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's routing rules"
  ON public.lead_routing_rules FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid()
  ));

CREATE POLICY "Admins can manage routing rules"
  ON public.lead_routing_rules FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  ));

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Update updated_at timestamp for slack_connections
CREATE OR REPLACE FUNCTION update_slack_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER slack_connections_updated_at
  BEFORE UPDATE ON public.slack_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_slack_connections_updated_at();

-- Update updated_at timestamp for lead_routing_rules
CREATE OR REPLACE FUNCTION update_lead_routing_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lead_routing_rules_updated_at
  BEFORE UPDATE ON public.lead_routing_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_lead_routing_rules_updated_at();

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE public.slack_connections IS 'Slack webhook connections for tenant notifications';
COMMENT ON TABLE public.lead_routing_rules IS 'Rules for automatically routing leads to team members';

COMMENT ON COLUMN public.slack_connections.webhook_url IS 'Slack incoming webhook URL';
COMMENT ON COLUMN public.slack_connections.channel IS 'Slack channel name';
COMMENT ON COLUMN public.slack_connections.enabled IS 'Whether notifications are enabled';

COMMENT ON COLUMN public.lead_routing_rules.type IS 'Routing algorithm: round_robin, skill_based, or load_balanced';
COMMENT ON COLUMN public.lead_routing_rules.conditions IS 'Optional conditions for rule application (JSON)';
COMMENT ON COLUMN public.lead_routing_rules.team_members IS 'Array of team member IDs eligible for assignment';
