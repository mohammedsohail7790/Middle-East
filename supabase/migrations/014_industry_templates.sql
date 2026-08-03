-- 014 Industry Templates
-- Add industry selection and config to voice_tenants table

ALTER TABLE voice_tenants
    ADD COLUMN IF NOT EXISTS industry TEXT DEFAULT 'hvac',
    ADD COLUMN IF NOT EXISTS call_handling_mode TEXT DEFAULT 'message' CHECK (call_handling_mode IN ('message', 'transfer', 'both')),
    ADD COLUMN IF NOT EXISTS working_hours TEXT,
    ADD COLUMN IF NOT EXISTS diagnostic_fee NUMERIC(10, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS industry_lead_fields JSONB DEFAULT '[]'::jsonb;

-- Index for filtering by industry
CREATE INDEX IF NOT EXISTS idx_voice_tenants_industry ON voice_tenants(industry);
