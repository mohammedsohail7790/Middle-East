-- ============================================================================
-- Call IQ — Onboarding Progress Tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.onboarding_progress (
    id                  BIGSERIAL PRIMARY KEY,
    tenant_id           UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE UNIQUE,
    step                TEXT NOT NULL DEFAULT 'company'
                        CHECK (step IN ('company', 'twilio', 'knowledge', 'crm', 'calendar', 'test_call', 'complete')),
    completed           BOOLEAN NOT NULL DEFAULT FALSE,
    twilio_provisioned  BOOLEAN NOT NULL DEFAULT FALSE,
    knowledge_uploaded  BOOLEAN NOT NULL DEFAULT FALSE,
    crm_connected       BOOLEAN NOT NULL DEFAULT FALSE,
    calendar_connected  BOOLEAN NOT NULL DEFAULT FALSE,
    test_call_completed BOOLEAN NOT NULL DEFAULT FALSE,
    skipped_steps       TEXT[] DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS onboarding_progress_tenant_select ON public.onboarding_progress;
DROP POLICY IF EXISTS onboarding_progress_tenant_insert ON public.onboarding_progress;
DROP POLICY IF EXISTS onboarding_progress_tenant_update ON public.onboarding_progress;

CREATE POLICY onboarding_progress_tenant_select ON public.onboarding_progress
    FOR SELECT
    TO authenticated
    USING (public.user_can_access_tenant(tenant_id));

CREATE POLICY onboarding_progress_tenant_insert ON public.onboarding_progress
    FOR INSERT
    TO authenticated
    WITH CHECK (public.user_can_access_tenant(tenant_id));

CREATE POLICY onboarding_progress_tenant_update ON public.onboarding_progress
    FOR UPDATE
    TO authenticated
    USING (public.user_can_access_tenant(tenant_id))
    WITH CHECK (public.user_can_access_tenant(tenant_id));

CREATE POLICY onboarding_progress_service_role ON public.onboarding_progress
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_onboarding_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_onboarding_progress_updated_at ON public.onboarding_progress;
CREATE TRIGGER trg_onboarding_progress_updated_at
    BEFORE UPDATE ON public.onboarding_progress
    FOR EACH ROW
    EXECUTE FUNCTION public.update_onboarding_progress_updated_at();
