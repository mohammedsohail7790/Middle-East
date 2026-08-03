-- Migration 007: AI Customization Per Tenant
-- Created: 2026-04-27
-- Description: Add comprehensive AI configuration per tenant

-- =====================================================
-- AI AGENT CONFIGURATION
-- =====================================================

-- AI agent configuration table
CREATE TABLE IF NOT EXISTS public.ai_agent_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  
  -- Core AI Settings
  model TEXT DEFAULT 'gpt-4' NOT NULL,
  temperature DECIMAL(3,2) DEFAULT 0.35 CHECK (temperature >= 0 AND temperature <= 2),
  max_tokens INTEGER DEFAULT 220 CHECK (max_tokens > 0),
  
  -- Personality & Tone
  agent_name TEXT DEFAULT 'AI Assistant',
  personality TEXT DEFAULT 'friendly, professional, and helpful',
  tone TEXT DEFAULT 'conversational and warm',
  speaking_style TEXT DEFAULT 'concise and clear',
  
  -- Business Context
  business_description TEXT,
  services_offered TEXT[] DEFAULT ARRAY[]::TEXT[],
  service_areas TEXT[] DEFAULT ARRAY[]::TEXT[],
  business_hours_description TEXT,
  
  -- Conversation Flow
  greeting_message TEXT DEFAULT 'Hello! How can I help you today?',
  qualification_questions JSONB DEFAULT '[]'::JSONB,
  required_fields TEXT[] DEFAULT ARRAY['name', 'phone', 'service']::TEXT[],
  optional_fields TEXT[] DEFAULT ARRAY['email', 'preferred_time', 'notes']::TEXT[],
  
  -- Response Behavior
  max_conversation_turns INTEGER DEFAULT 20,
  auto_transfer_enabled BOOLEAN DEFAULT false,
  transfer_conditions JSONB,
  fallback_message TEXT DEFAULT 'Let me connect you with someone who can help.',
  
  -- Custom Instructions
  system_instructions TEXT,
  do_instructions TEXT[] DEFAULT ARRAY[]::TEXT[],
  dont_instructions TEXT[] DEFAULT ARRAY[]::TEXT[],
  
  -- Knowledge Base
  faq_enabled BOOLEAN DEFAULT true,
  custom_knowledge TEXT,
  
  -- Integration Preferences
  auto_create_lead BOOLEAN DEFAULT true,
  auto_schedule_appointment BOOLEAN DEFAULT false,
  auto_send_confirmation BOOLEAN DEFAULT true,
  
  -- Advanced Settings
  sentiment_analysis_enabled BOOLEAN DEFAULT true,
  language TEXT DEFAULT 'en',
  voice_id TEXT,
  speech_rate DECIMAL(3,2) DEFAULT 1.0 CHECK (speech_rate >= 0.5 AND speech_rate <= 2.0),
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(tenant_id)
);

-- Index for tenant lookups
CREATE INDEX IF NOT EXISTS idx_ai_agent_configs_tenant 
  ON public.ai_agent_configs(tenant_id);

-- =====================================================
-- AI PROMPT TEMPLATES
-- =====================================================

-- Custom prompt templates per tenant
CREATE TABLE IF NOT EXISTS public.ai_prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  description TEXT,
  template_type TEXT NOT NULL CHECK (template_type IN ('system', 'greeting', 'qualification', 'closing', 'fallback')),
  template_content TEXT NOT NULL,
  variables JSONB DEFAULT '{}'::JSONB,
  
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for tenant and type lookups
CREATE INDEX IF NOT EXISTS idx_ai_prompt_templates_tenant_type 
  ON public.ai_prompt_templates(tenant_id, template_type, is_active);

-- =====================================================
-- AI CONVERSATION SCENARIOS
-- =====================================================

-- Pre-defined conversation scenarios
CREATE TABLE IF NOT EXISTS public.ai_conversation_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  description TEXT,
  trigger_keywords TEXT[] DEFAULT ARRAY[]::TEXT[],
  
  -- Scenario Configuration
  custom_greeting TEXT,
  custom_questions JSONB DEFAULT '[]'::JSONB,
  custom_responses JSONB DEFAULT '{}'::JSONB,
  
  -- Actions
  actions JSONB DEFAULT '[]'::JSONB, -- e.g., [{"type": "create_lead", "priority": "high"}]
  
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for tenant and keyword lookups
CREATE INDEX IF NOT EXISTS idx_ai_conversation_scenarios_tenant 
  ON public.ai_conversation_scenarios(tenant_id, is_active);

-- =====================================================
-- AI TRAINING DATA
-- =====================================================

-- Custom training examples per tenant
CREATE TABLE IF NOT EXISTS public.ai_training_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  
  example_type TEXT NOT NULL CHECK (example_type IN ('conversation', 'response', 'extraction', 'classification')),
  
  -- Training Data
  input_text TEXT NOT NULL,
  expected_output TEXT NOT NULL,
  context JSONB,
  
  -- Metadata
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  quality_score INTEGER CHECK (quality_score >= 1 AND quality_score <= 5),
  
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for tenant and type lookups
CREATE INDEX IF NOT EXISTS idx_ai_training_examples_tenant_type 
  ON public.ai_training_examples(tenant_id, example_type, is_active);

-- =====================================================
-- AI PERFORMANCE METRICS
-- =====================================================

-- Track AI performance per tenant
CREATE TABLE IF NOT EXISTS public.ai_performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  call_id UUID REFERENCES public.calls(id) ON DELETE CASCADE,
  
  -- Metrics
  conversation_turns INTEGER,
  avg_response_time_ms INTEGER,
  sentiment_score DECIMAL(3,2),
  
  -- Quality Indicators
  successful_extraction BOOLEAN,
  required_fields_collected TEXT[],
  customer_satisfaction INTEGER CHECK (customer_satisfaction >= 1 AND customer_satisfaction <= 5),
  
  -- Outcomes
  lead_created BOOLEAN DEFAULT false,
  appointment_scheduled BOOLEAN DEFAULT false,
  transfer_occurred BOOLEAN DEFAULT false,
  
  -- Metadata
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for analytics
CREATE INDEX IF NOT EXISTS idx_ai_performance_metrics_tenant_date 
  ON public.ai_performance_metrics(tenant_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_performance_metrics_call 
  ON public.ai_performance_metrics(call_id);

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- AI agent configs
ALTER TABLE public.ai_agent_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's AI config"
  ON public.ai_agent_configs FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid()
  ));

CREATE POLICY "Admins can manage AI config"
  ON public.ai_agent_configs FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  ));

-- Prompt templates
ALTER TABLE public.ai_prompt_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's prompt templates"
  ON public.ai_prompt_templates FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid()
  ));

CREATE POLICY "Admins can manage prompt templates"
  ON public.ai_prompt_templates FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  ));

-- Conversation scenarios
ALTER TABLE public.ai_conversation_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's scenarios"
  ON public.ai_conversation_scenarios FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid()
  ));

CREATE POLICY "Admins can manage scenarios"
  ON public.ai_conversation_scenarios FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  ));

-- Training examples
ALTER TABLE public.ai_training_examples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's training examples"
  ON public.ai_training_examples FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid()
  ));

CREATE POLICY "Admins can manage training examples"
  ON public.ai_training_examples FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  ));

-- Performance metrics
ALTER TABLE public.ai_performance_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's AI metrics"
  ON public.ai_performance_metrics FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members 
    WHERE user_id = auth.uid()
  ));

CREATE POLICY "System can insert AI metrics"
  ON public.ai_performance_metrics FOR INSERT
  WITH CHECK (true);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Update updated_at for ai_agent_configs
CREATE OR REPLACE FUNCTION update_ai_agent_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_agent_configs_updated_at
  BEFORE UPDATE ON public.ai_agent_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_agent_configs_updated_at();

-- Update updated_at for ai_prompt_templates
CREATE TRIGGER ai_prompt_templates_updated_at
  BEFORE UPDATE ON public.ai_prompt_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_agent_configs_updated_at();

-- Update updated_at for ai_conversation_scenarios
CREATE TRIGGER ai_conversation_scenarios_updated_at
  BEFORE UPDATE ON public.ai_conversation_scenarios
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_agent_configs_updated_at();

-- Update updated_at for ai_training_examples
CREATE TRIGGER ai_training_examples_updated_at
  BEFORE UPDATE ON public.ai_training_examples
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_agent_configs_updated_at();

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Get AI config for tenant (with defaults)
CREATE OR REPLACE FUNCTION get_ai_config_for_tenant(p_tenant_id UUID)
RETURNS TABLE (
  config_id UUID,
  model TEXT,
  temperature DECIMAL,
  agent_name TEXT,
  personality TEXT,
  greeting_message TEXT,
  system_instructions TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    id,
    model,
    temperature,
    agent_name,
    personality,
    greeting_message,
    system_instructions
  FROM public.ai_agent_configs
  WHERE tenant_id = p_tenant_id;
  
  -- If no config exists, return defaults
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT 
      NULL::UUID,
      'gpt-4'::TEXT,
      0.35::DECIMAL,
      'AI Assistant'::TEXT,
      'friendly, professional, and helpful'::TEXT,
      'Hello! How can I help you today?'::TEXT,
      NULL::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE public.ai_agent_configs IS 'AI agent configuration per tenant - core AI behavior';
COMMENT ON TABLE public.ai_prompt_templates IS 'Custom prompt templates per tenant';
COMMENT ON TABLE public.ai_conversation_scenarios IS 'Pre-defined conversation scenarios per tenant';
COMMENT ON TABLE public.ai_training_examples IS 'Custom training examples per tenant';
COMMENT ON TABLE public.ai_performance_metrics IS 'AI performance tracking per tenant';

COMMENT ON COLUMN public.ai_agent_configs.temperature IS 'AI creativity (0=deterministic, 2=creative)';
COMMENT ON COLUMN public.ai_agent_configs.personality IS 'Overall AI personality description';
COMMENT ON COLUMN public.ai_agent_configs.system_instructions IS 'Custom system prompt instructions';
COMMENT ON COLUMN public.ai_agent_configs.do_instructions IS 'Things the AI should do';
COMMENT ON COLUMN public.ai_agent_configs.dont_instructions IS 'Things the AI should not do';
