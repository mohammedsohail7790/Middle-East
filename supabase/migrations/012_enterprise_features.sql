-- Migration 012: Enterprise SaaS Features
-- Created: 2026-05-06
-- Description: Complete enterprise feature set for Call IQ SaaS

-- =====================================================
-- 1. AUDIT LOGS — Track every action taken by users
-- =====================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  user_id UUID,
  user_email TEXT,
  action TEXT NOT NULL CHECK (action IN (
    'tenant.created', 'tenant.updated', 'tenant.deleted',
    'team_member.added', 'team_member.updated', 'team_member.removed',
    'ai_config.updated', 'knowledge.created', 'knowledge.deleted',
    'phone_number.purchased', 'phone_number.released',
    'integration.connected', 'integration.disconnected',
    'webhook.created', 'webhook.updated', 'webhook.deleted',
    'api_key.created', 'api_key.revoked',
    'sso.configured', 'sso.disabled',
    'retention_policy.updated',
    'ivr_flow.created', 'ivr_flow.updated', 'ivr_flow.deleted',
    'scheduled_report.created', 'scheduled_report.updated', 'scheduled_report.deleted',
    'white_labeling.updated', 'ip_allowlist.updated'
  )),
  resource_type TEXT,
  resource_id TEXT,
  old_value JSONB,
  new_value JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON public.audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  ));

CREATE POLICY "System can insert audit logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (true);

-- =====================================================
-- 2. TENANT API KEYS — For developer API access
-- =====================================================

CREATE TABLE IF NOT EXISTS public.tenant_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,  -- First 8 chars for display (e.g., sk_calliq_xxxxxx...)
  scopes TEXT[] DEFAULT '{"read"}'::TEXT[],  -- read, write, webhooks
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_api_keys_tenant ON public.tenant_api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_api_keys_hash ON public.tenant_api_keys(key_hash) WHERE revoked_at IS NULL;

ALTER TABLE public.tenant_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage API keys"
  ON public.tenant_api_keys FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  ));

-- =====================================================
-- 3. CUSTOM WEBHOOKS — User-defined webhooks
-- =====================================================

CREATE TABLE IF NOT EXISTS public.custom_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL,  -- e.g., ['call.completed', 'lead.created', 'appointment.booked']
  secret TEXT,  -- HMAC signing secret
  headers JSONB DEFAULT '{}'::JSONB,
  active BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  last_error TEXT,
  failure_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_webhooks_tenant ON public.custom_webhooks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_custom_webhooks_active ON public.custom_webhooks(active) WHERE active = true;

ALTER TABLE public.custom_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage custom webhooks"
  ON public.custom_webhooks FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  ));

-- Webhook delivery log
CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID REFERENCES public.custom_webhooks(id) ON DELETE CASCADE NOT NULL,
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  delivered BOOLEAN DEFAULT false,
  attempted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON public.webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_tenant ON public.webhook_deliveries(tenant_id);

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view webhook deliveries"
  ON public.webhook_deliveries FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  ));

-- =====================================================
-- 4. WHITE-LABELING — Custom branding per tenant
-- =====================================================

ALTER TABLE public.voice_tenants
ADD COLUMN IF NOT EXISTS branding JSONB DEFAULT '{}'::JSONB;
-- branding structure: { logo_url, primary_color, secondary_color, favicon_url, custom_domain, company_name, support_email, support_phone, hide_calliq_branding }

-- =====================================================
-- 5. DATA RETENTION POLICIES
-- =====================================================

CREATE TABLE IF NOT EXISTS public.data_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL UNIQUE,
  call_recordings_days INTEGER DEFAULT 90,    -- Delete recordings after N days
  call_transcripts_days INTEGER DEFAULT 180,  -- Delete transcripts after N days
  lead_data_days INTEGER DEFAULT 365,         -- Delete leads after N days
  sms_messages_days INTEGER DEFAULT 90,       -- Delete SMS after N days
  analytics_days INTEGER DEFAULT 730,         -- Keep analytics for 2 years
  enabled BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_retention_policies_tenant ON public.data_retention_policies(tenant_id);

ALTER TABLE public.data_retention_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage retention policies"
  ON public.data_retention_policies FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  ));

-- =====================================================
-- 6. SSO / SAML CONFIGURATIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.sso_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL UNIQUE,
  provider TEXT CHECK (provider IN ('okta', 'azure_ad', 'google_workspace', 'saml_custom')),
  enabled BOOLEAN DEFAULT false,
  entity_id TEXT,
  sso_url TEXT,
  certificate TEXT,
  client_id TEXT,
  client_secret TEXT,
  domain TEXT,  -- e.g., "company.com" — only allow login from this domain
  attribute_mapping JSONB DEFAULT '{"email": "email", "name": "name", "role": "role"}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sso_configs_tenant ON public.sso_configs(tenant_id);

ALTER TABLE public.sso_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage SSO configs"
  ON public.sso_configs FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  ));

-- =====================================================
-- 7. MULTI-AGENT IVR WORKFLOWS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.ivr_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  greeting TEXT,  -- "Thank you for calling ABC. Press 1 for Sales, 2 for Support"
  steps JSONB NOT NULL DEFAULT '[]'::JSONB,
  /* steps structure:
  [
    {
      "id": "step_1",
      "type": "menu",
      "prompt": "Press 1 for Sales, 2 for Support, 3 for Billing",
      "options": [
        { "digit": "1", "next": "sales_agent", "agent_id": "uuid" },
        { "digit": "2", "next": "support_agent", "agent_id": "uuid" },
        { "digit": "3", "next": "billing_agent", "agent_id": "uuid" }
      ],
      "timeout_action": "default_agent"
    }
  ]
  */
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ivr_flows_tenant ON public.ivr_flows(tenant_id);

ALTER TABLE public.ivr_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage IVR flows"
  ON public.ivr_flows FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  ));

-- Multi-agent definitions
CREATE TABLE IF NOT EXISTS public.ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,  -- "Sales Agent", "Support Agent"
  role TEXT NOT NULL,  -- sales, support, billing, receptionist
  system_prompt TEXT NOT NULL,
  voice_id TEXT,
  tone TEXT DEFAULT 'professional',
  services TEXT[] DEFAULT '[]'::TEXT[],
  max_duration_seconds INTEGER DEFAULT 600,
  transfer_on_timeout BOOLEAN DEFAULT false,
  transfer_number TEXT,
  knowledge_category TEXT,  -- Only search KB entries in this category
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_agents_tenant ON public.ai_agents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_agents_role ON public.ai_agents(tenant_id, role);

ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage AI agents"
  ON public.ai_agents FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  ));

-- =====================================================
-- 8. SCHEDULED REPORTS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  report_type TEXT CHECK (report_type IN ('call_summary', 'lead_report', 'agent_performance', 'billing_overview')),
  frequency TEXT CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  day_of_week INTEGER,  -- 0-6 for weekly
  day_of_month INTEGER, -- 1-31 for monthly
  time_of_day TIME DEFAULT '09:00:00',
  recipients TEXT[] NOT NULL,  -- email addresses
  format TEXT DEFAULT 'pdf' CHECK (format IN ('pdf', 'csv', 'json')),
  include_raw_data BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  last_sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_reports_tenant ON public.scheduled_reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_active ON public.scheduled_reports(active) WHERE active = true;

ALTER TABLE public.scheduled_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage scheduled reports"
  ON public.scheduled_reports FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  ));

-- =====================================================
-- 9. RESELLER / MSP MODE — Parent tenant relationships
-- =====================================================

CREATE TABLE IF NOT EXISTS public.msp_tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  child_tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  relationship_type TEXT DEFAULT 'managed' CHECK (relationship_type IN ('managed', 'reseller', 'white_label')),
  markup_percentage NUMERIC DEFAULT 0,  -- Percentage markup on billing
  custom_branding JSONB DEFAULT '{}'::JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(parent_tenant_id, child_tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_msp_tenants_parent ON public.msp_tenants(parent_tenant_id);
CREATE INDEX IF NOT EXISTS idx_msp_tenants_child ON public.msp_tenants(child_tenant_id);

ALTER TABLE public.msp_tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parent tenants can view MSP relationships"
  ON public.msp_tenants FOR SELECT
  USING (parent_tenant_id IN (
    SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid()
  ));

CREATE POLICY "Admins can manage MSP relationships"
  ON public.msp_tenants FOR ALL
  USING (parent_tenant_id IN (
    SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid()
  ));

-- =====================================================
-- 10. IP ALLOWLIST
-- =====================================================

CREATE TABLE IF NOT EXISTS public.ip_allowlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  ip_address TEXT NOT NULL,  -- Can be CIDR: 192.168.1.0/24
  description TEXT,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, ip_address)
);

CREATE INDEX IF NOT EXISTS idx_ip_allowlist_tenant ON public.ip_allowlist(tenant_id);

ALTER TABLE public.ip_allowlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage IP allowlist"
  ON public.ip_allowlist FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  ));

-- =====================================================
-- 11. VOICE CLONES — Professional Voice Cloning
-- =====================================================

CREATE TABLE IF NOT EXISTS public.voice_clones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  elevenlabs_voice_id TEXT UNIQUE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  samples_uploaded INTEGER DEFAULT 0,
  sample_duration_seconds INTEGER DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_clones_tenant ON public.voice_clones(tenant_id);
CREATE INDEX IF NOT EXISTS idx_voice_clones_status ON public.voice_clones(status);

ALTER TABLE public.voice_clones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage voice clones"
  ON public.voice_clones FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  ));

-- =====================================================
-- 12. QA / SUPERVISOR EVALUATIONS
-- =====================================================

-- Extend call_evaluations with supervisor fields
ALTER TABLE public.call_evaluations
ADD COLUMN IF NOT EXISTS supervisor_score INTEGER CHECK (supervisor_score BETWEEN 1 AND 5),
ADD COLUMN IF NOT EXISTS supervisor_notes TEXT,
ADD COLUMN IF NOT EXISTS supervisor_id UUID,
ADD COLUMN IF NOT EXISTS flagged BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS flag_reason TEXT,
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- QA rubrics
CREATE TABLE IF NOT EXISTS public.qa_rubrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  criteria JSONB NOT NULL DEFAULT '[]'::JSONB,
  /* criteria structure:
  [
    { "id": "greeting", "label": "Proper Greeting", "weight": 1, "description": "Agent greeted caller professionally" },
    { "id": "empathy", "label": "Empathy Shown", "weight": 2, "description": "Agent showed empathy for caller's situation" }
  ]
  */
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qa_rubrics_tenant ON public.qa_rubrics(tenant_id);

ALTER TABLE public.qa_rubrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage QA rubrics"
  ON public.qa_rubrics FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  ));

-- =====================================================
-- 13. HELPER FUNCTIONS
-- =====================================================

-- Function: Cleanup expired data based on retention policies
CREATE OR REPLACE FUNCTION cleanup_retention_data()
RETURNS void AS $$
DECLARE
  policy RECORD;
BEGIN
  FOR policy IN SELECT * FROM public.data_retention_policies WHERE enabled = true LOOP
    -- Delete old recordings
    UPDATE public.calls 
    SET recording_url = NULL 
    WHERE tenant_id = policy.tenant_id 
      AND created_at < NOW() - (policy.call_recordings_days || ' days')::INTERVAL
      AND recording_url IS NOT NULL;
    
    -- Delete old transcripts
    UPDATE public.calls 
    SET transcript = NULL 
    WHERE tenant_id = policy.tenant_id 
      AND created_at < NOW() - (policy.call_transcripts_days || ' days')::INTERVAL
      AND transcript IS NOT NULL;
    
    -- Delete old SMS
    DELETE FROM public.sms_messages 
    WHERE tenant_id = policy.tenant_id 
      AND created_at < NOW() - (policy.sms_messages_days || ' days')::INTERVAL;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function: Get MSP dashboard summary
CREATE OR REPLACE FUNCTION get_msp_dashboard(p_parent_tenant_id UUID)
RETURNS TABLE (
  total_child_tenants BIGINT,
  total_calls_this_month BIGINT,
  total_revenue NUMERIC,
  active_tenants BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(DISTINCT mt.child_tenant_id),
    COALESCE(SUM(c.call_count), 0),
    COALESCE(SUM(s.monthly_cost * mt.markup_percentage / 100), 0),
    COUNT(DISTINCT CASE WHEN vt.is_active = true THEN mt.child_tenant_id END)
  FROM public.msp_tenants mt
  LEFT JOIN public.voice_tenants vt ON vt.id = mt.child_tenant_id
  LEFT JOIN (
    SELECT tenant_id, COUNT(*) as call_count 
    FROM public.calls 
    WHERE created_at >= NOW() - INTERVAL '30 days'
    GROUP BY tenant_id
  ) c ON c.tenant_id = mt.child_tenant_id
  LEFT JOIN public.subscriptions s ON s.tenant_id = mt.child_tenant_id AND s.status IN ('active', 'trialing')
  WHERE mt.parent_tenant_id = p_parent_tenant_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE public.audit_logs IS 'Immutable log of all user actions for compliance';
COMMENT ON TABLE public.tenant_api_keys IS 'API keys for developer access to tenant data';
COMMENT ON TABLE public.custom_webhooks IS 'User-defined webhooks for event-driven integrations';
COMMENT ON TABLE public.sso_configs IS 'SSO/SAML configurations for enterprise login';
COMMENT ON TABLE public.ivr_flows IS 'Multi-agent IVR routing configurations';
COMMENT ON TABLE public.ai_agents IS 'Specialized AI agents (sales, support, billing)';
COMMENT ON TABLE public.scheduled_reports IS 'Automated email reports';
COMMENT ON TABLE public.msp_tenants IS 'Parent-child tenant relationships for MSP/Reseller mode';
COMMENT ON TABLE public.ip_allowlist IS 'IP-based access restrictions';
COMMENT ON TABLE public.voice_clones IS 'Professional voice cloning configurations';
COMMENT ON TABLE public.qa_rubrics IS 'Quality assurance evaluation criteria';
COMMENT ON FUNCTION cleanup_retention_data IS 'Applies data retention policies (run via cron)';
COMMENT ON FUNCTION get_msp_dashboard IS 'Returns MSP dashboard summary for parent tenant';
