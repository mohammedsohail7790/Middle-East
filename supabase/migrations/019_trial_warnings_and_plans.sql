-- Trial billing bootstrap (safe if 016 was never applied) + warning thresholds 40/50/55/58

-- ============================================================================
-- 1. subscriptions trial columns (from 016)
-- ============================================================================
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_minutes_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS included_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overage_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overage_charged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS billing_anchor timestamptz;

-- ============================================================================
-- 2. billing_warnings (create if missing, then widen warning_type check)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.billing_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  warning_type text NOT NULL,
  message text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  acknowledged boolean NOT NULL DEFAULT false,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_warnings_tenant
  ON public.billing_warnings (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_warnings_unacknowledged
  ON public.billing_warnings (tenant_id, warning_type)
  WHERE NOT acknowledged;

ALTER TABLE public.billing_warnings
  DROP CONSTRAINT IF EXISTS billing_warnings_warning_type_check;

ALTER TABLE public.billing_warnings
  ADD CONSTRAINT billing_warnings_warning_type_check
  CHECK (warning_type IN (
    'trial_40_minutes',
    'trial_45_minutes',
    'trial_50_minutes',
    'trial_55_minutes',
    'trial_58_minutes',
    'trial_expired',
    'usage_90_percent',
    'usage_100_percent',
    'payment_failed',
    'subscription_expiring'
  ));

-- ============================================================================
-- 3. minutes_accounting (minimal bootstrap if 016 skipped)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.minutes_accounting (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  call_sid text NOT NULL,
  duration_seconds integer NOT NULL DEFAULT 0,
  billed_minutes integer NOT NULL DEFAULT 1,
  source text NOT NULL DEFAULT 'voice',
  is_trial boolean NOT NULL DEFAULT false,
  billing_period_start date NOT NULL DEFAULT CURRENT_DATE,
  billing_period_end date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_minutes_accounting_call_dedup
  ON public.minutes_accounting (tenant_id, call_sid, source);

CREATE INDEX IF NOT EXISTS idx_minutes_accounting_tenant_period
  ON public.minutes_accounting (tenant_id, billing_period_start DESC);

-- ============================================================================
-- 4. voice_tenants billing block flag
-- ============================================================================
ALTER TABLE public.voice_tenants
  ADD COLUMN IF NOT EXISTS billing_block_reason text;

ALTER TABLE public.voice_tenants
  DROP CONSTRAINT IF EXISTS voice_tenants_billing_block_reason_check;

ALTER TABLE public.voice_tenants
  ADD CONSTRAINT voice_tenants_billing_block_reason_check
  CHECK (billing_block_reason IS NULL OR billing_block_reason IN (
    'trial_expired',
    'trial_minutes_exhausted',
    'subscription_inactive',
    'usage_limit_reached',
    'payment_required'
  ));

-- ============================================================================
-- 5. plan enum — allow essential (runtime plan id)
-- ============================================================================
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_plan_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_plan_check
  CHECK (plan IN ('starter', 'essential', 'professional', 'business', 'enterprise'));

-- ============================================================================
-- 6. RLS (idempotent)
-- ============================================================================
ALTER TABLE public.billing_warnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minutes_accounting ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_warnings_tenant_isolation ON public.billing_warnings;
CREATE POLICY billing_warnings_tenant_isolation ON public.billing_warnings
  FOR ALL USING (tenant_id IN (
    SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid()
  ));

DROP POLICY IF EXISTS minutes_accounting_tenant_isolation ON public.minutes_accounting;
CREATE POLICY minutes_accounting_tenant_isolation ON public.minutes_accounting
  FOR ALL USING (tenant_id IN (
    SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid()
  ));
