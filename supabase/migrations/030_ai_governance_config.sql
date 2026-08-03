-- P3: AI runtime governance fields on ai_agent_configs
ALTER TABLE public.ai_agent_configs
  ADD COLUMN IF NOT EXISTS allowed_tools JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS disabled_tools JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS execution_limits JSONB DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS risk_tolerance TEXT DEFAULT 'standard'
    CHECK (risk_tolerance IN ('strict', 'standard', 'permissive')),
  ADD COLUMN IF NOT EXISTS safety_mode TEXT DEFAULT 'standard'
    CHECK (safety_mode IN ('strict', 'standard', 'off')),
  ADD COLUMN IF NOT EXISTS confirmation_required_tools JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS ai_governance_enabled BOOLEAN DEFAULT true;

COMMENT ON COLUMN public.ai_agent_configs.allowed_tools IS 'P3: allowlist; empty = all default tools';
COMMENT ON COLUMN public.ai_agent_configs.disabled_tools IS 'P3: denylist tool names';
COMMENT ON COLUMN public.ai_agent_configs.execution_limits IS 'P3: { maxPerCall, maxPerMinute, toolCooldownMs }';
