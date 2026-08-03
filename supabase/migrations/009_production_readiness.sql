-- Migration 009: Production Readiness — Billing, Analytics, Security
-- Created: 2026-05-06
-- Description: Final production schema additions for Call IQ SaaS launch

-- =====================================================
-- 1. CALL EVALUATIONS (post-call AI analytics)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.call_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID UNIQUE REFERENCES public.calls(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  sentiment TEXT DEFAULT 'neutral' CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  sentiment_score INTEGER DEFAULT 50 CHECK (sentiment_score BETWEEN 0 AND 100),
  frustration_level INTEGER DEFAULT 0 CHECK (frustration_level BETWEEN 0 AND 100),
  call_success BOOLEAN DEFAULT false,
  lead_quality TEXT DEFAULT 'low' CHECK (lead_quality IN ('low', 'medium', 'high')),
  summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_evaluations_tenant ON public.call_evaluations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_call_evaluations_sentiment ON public.call_evaluations(sentiment);
CREATE INDEX IF NOT EXISTS idx_call_evaluations_quality ON public.call_evaluations(lead_quality);

ALTER TABLE public.call_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's call evaluations"
  ON public.call_evaluations FOR SELECT
  USING (tenant_id IN (SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid()));

CREATE POLICY "System can insert call evaluations"
  ON public.call_evaluations FOR INSERT
  WITH CHECK (true);

-- =====================================================
-- 2. BILLING ENHANCEMENTS — Stripe metered billing support
-- =====================================================

-- Add overage tracking to usage_records
ALTER TABLE public.usage_records
ADD COLUMN IF NOT EXISTS overage_minutes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS overage_amount DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS stripe_usage_record_id TEXT,
ADD COLUMN IF NOT EXISTS billed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS billed_at TIMESTAMPTZ;

-- Add payment method tracking to subscriptions
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS default_payment_method_id TEXT,
ADD COLUMN IF NOT EXISTS last_payment_error TEXT,
ADD COLUMN IF NOT EXISTS overage_enabled BOOLEAN DEFAULT true;

-- Add currency and billing reason to invoices
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'usd',
ADD COLUMN IF NOT EXISTS billing_reason TEXT CHECK (billing_reason IN ('subscription_create', 'subscription_cycle', 'subscription_update', 'manual', 'overage')),
ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL;

-- Add indexes for billing queries
CREATE INDEX IF NOT EXISTS idx_usage_records_tenant_period ON public.usage_records(tenant_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_usage_records_billed ON public.usage_records(billed) WHERE billed = false;
CREATE INDEX IF NOT EXISTS idx_invoices_subscription ON public.invoices(subscription_id);

-- =====================================================
-- 3. CALLS — Add outcome and missed reason tracking
-- =====================================================

ALTER TABLE public.calls
ADD COLUMN IF NOT EXISTS outcome TEXT CHECK (outcome IN ('completed', 'transferred', 'missed', 'no_answer', 'busy')),
ADD COLUMN IF NOT EXISTS missed_reason TEXT,
ADD COLUMN IF NOT EXISTS transfer_target TEXT,
ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en',
ADD COLUMN IF NOT EXISTS latency NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS duration_ms INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_calls_outcome ON public.calls(outcome);
CREATE INDEX IF NOT EXISTS idx_calls_tenant ON public.calls(tenant_id);

-- =====================================================
-- 4. VOICE TENANTS — Add metadata and Zapier fields
-- =====================================================

ALTER TABLE public.voice_tenants
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::JSONB,
ADD COLUMN IF NOT EXISTS zapier_webhook_url TEXT,
ADD COLUMN IF NOT EXISTS transfer_phone_number TEXT,
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC',
ADD COLUMN IF NOT EXISTS diagnostic_fee NUMERIC DEFAULT 125;

-- =====================================================
-- 5. SMS — Add conversation tracking
-- =====================================================

-- Ensure sms_conversations has proper structure
ALTER TABLE public.sms_conversations
ADD COLUMN IF NOT EXISTS customer_name TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived')),
ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ DEFAULT NOW();

-- Ensure sms_messages has direction and body fields
ALTER TABLE public.sms_messages
ADD COLUMN IF NOT EXISTS direction TEXT CHECK (direction IN ('inbound', 'outbound')),
ADD COLUMN IF NOT EXISTS body TEXT;

-- =====================================================
-- 6. AUTOMATION RULES
-- =====================================================

CREATE TABLE IF NOT EXISTS public.automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  trigger TEXT NOT NULL, -- 'call_completed', 'lead_created', 'appointment_booked', 'missed_call'
  action TEXT NOT NULL, -- 'send_sms', 'send_email', 'create_lead', 'notify_slack', 'create_crm_record'
  template TEXT,
  delay INTEGER DEFAULT 0, -- seconds
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_rules_tenant ON public.automation_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_enabled ON public.automation_rules(enabled) WHERE enabled = true;

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's automation rules"
  ON public.automation_rules FOR SELECT
  USING (tenant_id IN (SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid()));

CREATE POLICY "Admins can manage automation rules"
  ON public.automation_rules FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  ));

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_automation_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER automation_rules_updated_at
  BEFORE UPDATE ON public.automation_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_automation_rules_updated_at();

-- =====================================================
-- 7. LEADS — Ensure status and fingerprint tracking
-- =====================================================

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS fingerprint TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'won', 'lost', 'nurturing')),
ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0 CHECK (score >= 0 AND score <= 100),
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS source TEXT,
ADD COLUMN IF NOT EXISTS tags TEXT[],
ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::JSONB;

-- Unique fingerprint per tenant for deduplication
CREATE INDEX IF NOT EXISTS idx_leads_fingerprint ON public.leads(tenant_id, fingerprint) WHERE fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_score ON public.leads(score DESC);

-- =====================================================
-- 8. APPOINTMENTS — Ensure proper fields
-- =====================================================

ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS name TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS service TEXT,
ADD COLUMN IF NOT EXISTS scheduled_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'booked' CHECK (status IN ('booked', 'confirmed', 'cancelled', 'no_show', 'completed')),
ADD COLUMN IF NOT EXISTS calendar_event_id TEXT,
ADD COLUMN IF NOT EXISTS reminder_24h_sent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS reminder_1h_sent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS cancelled_by TEXT,
ADD COLUMN IF NOT EXISTS rescheduled_from UUID REFERENCES public.appointments(id),
ADD COLUMN IF NOT EXISTS external_calendar_event_id TEXT;

CREATE INDEX IF NOT EXISTS idx_appointments_tenant ON public.appointments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_appointments_time ON public.appointments(scheduled_time);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);

-- =====================================================
-- 9. KNOWLEDGE BASE — Ensure embedding support (pgvector)
-- =====================================================

-- Enable pgvector extension (Supabase provides this)
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.knowledge_base
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'hvac',
ADD COLUMN IF NOT EXISTS content TEXT NOT NULL,
ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_tenant ON public.knowledge_base(tenant_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_category ON public.knowledge_base(category);

-- =====================================================
-- 10. BUSINESS HOURS — Ensure proper structure
-- =====================================================

ALTER TABLE public.business_hours
ADD COLUMN IF NOT EXISTS day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
ADD COLUMN IF NOT EXISTS start_time TIME,
ADD COLUMN IF NOT EXISTS end_time TIME,
ADD COLUMN IF NOT EXISTS is_closed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';

-- Ensure unique constraint on tenant + day
ALTER TABLE public.business_hours
DROP CONSTRAINT IF EXISTS business_hours_tenant_id_day_of_week_key;

ALTER TABLE public.business_hours
ADD CONSTRAINT IF NOT EXISTS business_hours_tenant_day_unique UNIQUE (tenant_id, day_of_week);

-- =====================================================
-- 11. TEAM MEMBERS — Ensure proper structure
-- =====================================================

ALTER TABLE public.team_members
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS email TEXT NOT NULL,
ADD COLUMN IF NOT EXISTS full_name TEXT,
ADD COLUMN IF NOT EXISTS name TEXT,
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'agent' CHECK (role IN ('owner', 'admin', 'manager', 'agent')),
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::JSONB,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended', 'inactive'));

CREATE INDEX IF NOT EXISTS idx_team_members_tenant ON public.team_members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_team_members_email ON public.team_members(email);

-- =====================================================
-- 12. INTEGRATION CONFIG — Centralized integration state
-- =====================================================

CREATE TABLE IF NOT EXISTS public.integrations_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL, -- 'servicetitan', 'jobber', 'housecallpro', 'salesforce', 'hubspot', 'zapier', 'slack', 'google_calendar'
  enabled BOOLEAN DEFAULT false,
  config JSONB DEFAULT '{}'::JSONB,
  status TEXT DEFAULT 'disconnected' CHECK (status IN ('disconnected', 'connecting', 'connected', 'error')),
  last_sync_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_integrations_config_tenant ON public.integrations_config(tenant_id);
CREATE INDEX IF NOT EXISTS idx_integrations_config_provider ON public.integrations_config(provider);

ALTER TABLE public.integrations_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's integrations"
  ON public.integrations_config FOR SELECT
  USING (tenant_id IN (SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid()));

CREATE POLICY "Admins can manage integrations"
  ON public.integrations_config FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  ));

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_integrations_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER integrations_config_updated_at
  BEFORE UPDATE ON public.integrations_config
  FOR EACH ROW
  EXECUTE FUNCTION update_integrations_config_updated_at();

-- =====================================================
-- 13. SLACK CONNECTIONS — Ensure proper structure
-- =====================================================

ALTER TABLE public.slack_connections
ADD COLUMN IF NOT EXISTS webhook_url TEXT,
ADD COLUMN IF NOT EXISTS channel TEXT,
ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true;

-- =====================================================
-- 14. CALENDAR CONNECTIONS — Ensure proper structure
-- =====================================================

ALTER TABLE public.calendar_connections
ADD COLUMN IF NOT EXISTS provider TEXT CHECK (provider IN ('google', 'outlook', 'apple', 'calendly', 'cal_com')),
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS access_token TEXT,
ADD COLUMN IF NOT EXISTS refresh_token TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'disconnected'));

-- =====================================================
-- 15. AI CONFIG — Ensure proper structure
-- =====================================================

ALTER TABLE public.ai_agent_configs
ADD COLUMN IF NOT EXISTS custom_questions JSONB DEFAULT '[]'::JSONB,
ADD COLUMN IF NOT EXISTS voice_id TEXT,
ADD COLUMN IF NOT EXISTS system_prompt TEXT;

-- Also create ai_configs table if not exists (alternative table used by some controllers)
CREATE TABLE IF NOT EXISTS public.ai_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  system_prompt TEXT,
  temperature NUMERIC DEFAULT 0.4,
  max_tokens INTEGER DEFAULT 500,
  voice_id TEXT,
  custom_questions JSONB DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_configs_tenant ON public.ai_configs(tenant_id);

ALTER TABLE public.ai_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's AI config"
  ON public.ai_configs FOR SELECT
  USING (tenant_id IN (SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid()));

CREATE POLICY "Admins can manage AI config"
  ON public.ai_configs FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  ));

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_ai_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_configs_updated_at
  BEFORE UPDATE ON public.ai_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_configs_updated_at();

-- =====================================================
-- 16. RLS POLICIES — Billing tables
-- =====================================================

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's subscriptions"
  ON public.subscriptions FOR SELECT
  USING (tenant_id IN (SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid()));

CREATE POLICY "Admins can manage subscriptions"
  ON public.subscriptions FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  ));

CREATE POLICY "Users can view their tenant's usage records"
  ON public.usage_records FOR SELECT
  USING (tenant_id IN (SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid()));

CREATE POLICY "System can insert usage records"
  ON public.usage_records FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can view their tenant's invoices"
  ON public.invoices FOR SELECT
  USING (tenant_id IN (SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid()));

CREATE POLICY "System can manage invoices"
  ON public.invoices FOR ALL
  WITH CHECK (true);

-- =====================================================
-- 17. HELPER FUNCTIONS
-- =====================================================

-- Function: Get active subscription for tenant
CREATE OR REPLACE FUNCTION get_active_subscription(p_tenant_id UUID)
RETURNS TABLE (
  subscription_id UUID,
  plan TEXT,
  status TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.plan,
    s.status,
    s.current_period_start,
    s.current_period_end,
    s.cancel_at_period_end
  FROM public.subscriptions s
  WHERE s.tenant_id = p_tenant_id 
    AND s.status IN ('active', 'trialing')
  ORDER BY s.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function: Get usage for current billing period
CREATE OR REPLACE FUNCTION get_current_usage(p_tenant_id UUID)
RETURNS TABLE (
  period_start DATE,
  period_end DATE,
  total_calls INTEGER,
  total_minutes INTEGER,
  total_sms INTEGER,
  overage_minutes INTEGER,
  overage_amount NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ur.period_start,
    ur.period_end,
    ur.total_calls,
    ur.total_minutes,
    ur.total_sms,
    ur.overage_minutes,
    ur.overage_amount
  FROM public.usage_records ur
  WHERE ur.tenant_id = p_tenant_id
    AND NOW() BETWEEN ur.period_start AND ur.period_end
  ORDER BY ur.period_start DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function: Get tenant with subscription info
CREATE OR REPLACE FUNCTION get_tenant_with_subscription(p_tenant_id UUID)
RETURNS TABLE (
  tenant_id UUID,
  company_name TEXT,
  phone_number TEXT,
  plan TEXT,
  subscription_status TEXT,
  current_period_end TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    vt.id,
    vt.company_name,
    vt.phone_number,
    s.plan,
    s.status,
    s.current_period_end
  FROM public.voice_tenants vt
  LEFT JOIN public.subscriptions s ON s.tenant_id = vt.id
  WHERE vt.id = p_tenant_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 18. CLEANUP FUNCTIONS
-- =====================================================

-- Function: Cleanup expired data (run via cron)
CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS void AS $$
BEGIN
  -- Delete expired OAuth states
  DELETE FROM public.integration_oauth_states WHERE expires_at < NOW();
  
  -- Delete old webhook logs (keep 90 days)
  DELETE FROM public.webhook_logs WHERE created_at < NOW() - INTERVAL '90 days';
  
  -- Archive old notifications (mark as read after 30 days)
  UPDATE public.notifications 
  SET is_read = true, read_at = NOW() 
  WHERE is_read = false AND created_at < NOW() - INTERVAL '30 days';
  
  -- Delete old daily metrics (keep 2 years)
  DELETE FROM public.daily_metrics WHERE date < NOW() - INTERVAL '2 years';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE public.call_evaluations IS 'AI-evaluated call quality metrics per call';
COMMENT ON TABLE public.integrations_config IS 'Centralized integration configuration and status per tenant';
COMMENT ON TABLE public.ai_configs IS 'AI agent configuration per tenant (simplified version)';
COMMENT ON FUNCTION get_active_subscription IS 'Returns the active subscription for a tenant';
COMMENT ON FUNCTION get_current_usage IS 'Returns usage records for the current billing period';
COMMENT ON FUNCTION get_tenant_with_subscription IS 'Returns tenant info with subscription details';
COMMENT ON FUNCTION cleanup_expired_data IS 'Cleans up expired and old data (run via cron)';
