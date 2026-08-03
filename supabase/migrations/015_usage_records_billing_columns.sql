-- Migration: Add billing columns to usage_records for Stripe metered billing
-- Required by billing.service.ts for per-subscription usage tracking

-- Drop old unique constraint that conflicts with new per-subscription tracking
ALTER TABLE public.usage_records
DROP CONSTRAINT IF EXISTS usage_records_tenant_id_period_start_key;

-- Add columns needed by billing.service.ts
ALTER TABLE public.usage_records
ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'call_minutes',
ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Index for subscription_id lookups
CREATE INDEX IF NOT EXISTS idx_usage_records_subscription_id
ON public.usage_records (subscription_id);

-- Drop old partial unique INDEX from earlier version of this migration (now replaced by CONSTRAINT)
DROP INDEX IF EXISTS idx_usage_records_unique_sub;

-- Proper unique constraint for upsert support
-- PostgreSQL treats NULLs as distinct in unique constraints, so rows with NULL
-- subscription_id are allowed to coexist (handled by separate INSERT path).
-- This enables ON CONFLICT ON CONSTRAINT in billing writes.
ALTER TABLE public.usage_records
DROP CONSTRAINT IF EXISTS usage_records_subscription_unique;

ALTER TABLE public.usage_records
ADD CONSTRAINT usage_records_subscription_unique
UNIQUE (tenant_id, subscription_id, type, period_start);
