-- 016_trial_subscription_billing.sql
-- Trial management, minute accounting, warning system, and billing enhancements

-- ============================================================================
-- 1. ADD TRIAL COLUMNS TO subscriptions
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
-- 2. CREATE billing_warnings TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.billing_warnings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
    warning_type text NOT NULL CHECK (warning_type IN (
        'trial_45_minutes',
        'trial_55_minutes',
        'trial_expired',
        'usage_90_percent',
        'usage_100_percent',
        'payment_failed',
        'subscription_expiring'
    )),
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

-- ============================================================================
-- 3. CREATE minutes_accounting TABLE (per-call granular tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.minutes_accounting (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
    subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
    call_sid text NOT NULL,
    duration_seconds integer NOT NULL,
    billed_minutes integer NOT NULL,  -- ceil(duration_seconds / 60)
    source text NOT NULL DEFAULT 'voice' CHECK (source IN ('voice', 'sms', 'api')),
    is_trial boolean NOT NULL DEFAULT false,
    billing_period_start date NOT NULL,
    billing_period_end date NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_minutes_accounting_tenant_period
    ON public.minutes_accounting (tenant_id, billing_period_start DESC);

CREATE INDEX IF NOT EXISTS idx_minutes_accounting_call_sid
    ON public.minutes_accounting (call_sid);

CREATE UNIQUE INDEX IF NOT EXISTS idx_minutes_accounting_call_dedup
    ON public.minutes_accounting (tenant_id, call_sid, source);

-- ============================================================================
-- 4. ADD billing block reason to voice_tenants
-- ============================================================================
ALTER TABLE public.voice_tenants
  ADD COLUMN IF NOT EXISTS billing_block_reason text CHECK (billing_block_reason IN (
      'trial_expired',
      'trial_minutes_exhausted',
      'subscription_inactive',
      'usage_limit_reached',
      'payment_required'
  ));

-- ============================================================================
-- 5. CREATE helper functions
-- ============================================================================

-- Get trial status for a tenant
CREATE OR REPLACE FUNCTION public.get_trial_status(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_sub public.subscriptions;
    v_used_minutes integer;
    v_result jsonb;
BEGIN
    SELECT * INTO v_sub
    FROM public.subscriptions
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_sub.id IS NULL THEN
        RETURN jsonb_build_object(
            'is_trialing', false,
            'has_subscription', false
        );
    END IF;

    -- Count trial minutes used
    SELECT COALESCE(SUM(billed_minutes), 0) INTO v_used_minutes
    FROM public.minutes_accounting
    WHERE tenant_id = p_tenant_id
      AND is_trial = true;

    RETURN jsonb_build_object(
        'is_trialing', v_sub.status = 'trialing',
        'has_subscription', true,
        'trial_started_at', v_sub.trial_started_at,
        'trial_expires_at', v_sub.trial_expires_at,
        'trial_minutes_used', v_used_minutes,
        'trial_minutes_limit', 60,
        'trial_days_limit', 14,
        'trial_expired', (
            CASE WHEN v_sub.trial_expires_at IS NOT NULL
                 AND v_sub.trial_expires_at < now() THEN true
                 ELSE false
            END
        ),
        'trial_minutes_exhausted', (v_used_minutes >= 60),
        'days_remaining', (
            CASE WHEN v_sub.trial_expires_at IS NOT NULL
                 THEN GREATEST(0, extract(epoch from (v_sub.trial_expires_at - now())) / 86400)::int
                 ELSE 0
            END
        ),
        'plan', v_sub.plan,
        'status', v_sub.status
    );
END;
$$;

-- Get current billing period usage summary
CREATE OR REPLACE FUNCTION public.get_billing_usage(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_sub public.subscriptions;
    v_used integer;
    v_included integer;
    v_overage integer;
    v_trial boolean;
    v_result jsonb;
BEGIN
    SELECT * INTO v_sub
    FROM public.subscriptions
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_sub.id IS NULL THEN
        RETURN jsonb_build_object(
            'has_subscription', false,
            'used_minutes', 0,
            'included_minutes', 0,
            'overage_minutes', 0
        );
    END IF;

    v_trial := (v_sub.status = 'trialing');
    v_included := CASE WHEN v_trial THEN 60 ELSE v_sub.included_minutes END;

    SELECT COALESCE(SUM(billed_minutes), 0) INTO v_used
    FROM public.minutes_accounting
    WHERE tenant_id = p_tenant_id
      AND (is_trial = v_trial OR NOT is_trial)
      AND billing_period_start >= CASE
          WHEN v_sub.current_period_start IS NOT NULL
          THEN v_sub.current_period_start::date
          ELSE date_trunc('month', now())::date
      END;

    v_overage := GREATEST(0, v_used - v_included);

    RETURN jsonb_build_object(
        'has_subscription', true,
        'period_start', v_sub.current_period_start,
        'period_end', v_sub.current_period_end,
        'used_minutes', v_used,
        'included_minutes', v_included,
        'overage_minutes', v_overage,
        'usage_percent', CASE WHEN v_included > 0
            THEN ROUND((v_used::numeric / v_included) * 100, 1)
            ELSE 0
        END,
        'is_trialing', v_trial,
        'plan', v_sub.plan
    );
END;
$$;

-- ============================================================================
-- 6. ENABLE RLS on new tables
-- ============================================================================
ALTER TABLE public.billing_warnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minutes_accounting ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policies
CREATE POLICY billing_warnings_tenant_isolation ON public.billing_warnings
    FOR ALL USING (tenant_id = auth.uid());

CREATE POLICY minutes_accounting_tenant_isolation ON public.minutes_accounting
    FOR ALL USING (tenant_id = auth.uid());

-- ============================================================================
-- 7. ADD function to create billing warning
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_billing_warning(
    p_tenant_id uuid,
    p_warning_type text,
    p_message text,
    p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
    v_warning_id uuid;
BEGIN
    INSERT INTO public.billing_warnings (tenant_id, warning_type, message, details)
    VALUES (p_tenant_id, p_warning_type, p_message, p_details)
    RETURNING id INTO v_warning_id;

    RETURN v_warning_id;
END;
$$;
