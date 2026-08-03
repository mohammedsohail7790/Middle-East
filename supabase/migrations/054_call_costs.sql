-- ============================================================================
-- Call IQ — Call Cost Tracking
-- Tracks per-call cost breakdown for profitability analysis
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.call_costs (
    id                  BIGSERIAL PRIMARY KEY,
    call_id             TEXT NOT NULL UNIQUE,
    tenant_id           UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
    input_tokens        INTEGER NOT NULL DEFAULT 0,
    output_tokens       INTEGER NOT NULL DEFAULT 0,
    audio_input_seconds NUMERIC(10,2) NOT NULL DEFAULT 0,
    audio_output_seconds NUMERIC(10,2) NOT NULL DEFAULT 0,
    call_minutes        NUMERIC(10,2) NOT NULL DEFAULT 0,
    sms_count           INTEGER NOT NULL DEFAULT 0,
    openai_cost         NUMERIC(12,6) NOT NULL DEFAULT 0,
    twilio_cost         NUMERIC(12,6) NOT NULL DEFAULT 0,
    total_cost          NUMERIC(12,6) NOT NULL DEFAULT 0,
    estimated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_costs_tenant ON public.call_costs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_call_costs_estimated_at ON public.call_costs(estimated_at);

ALTER TABLE public.call_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS call_costs_tenant_select ON public.call_costs;
DROP POLICY IF EXISTS call_costs_tenant_insert ON public.call_costs;
DROP POLICY IF EXISTS call_costs_service_select ON public.call_costs;
DROP POLICY IF EXISTS "call_costs_tenant_select" ON public.call_costs;
DROP POLICY IF EXISTS "call_costs_service_role" ON public.call_costs;

CREATE POLICY "call_costs_tenant_select"
    ON public.call_costs FOR SELECT
    TO authenticated
    USING (public.user_can_access_tenant(tenant_id));

CREATE POLICY "call_costs_service_role"
    ON public.call_costs FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Cost alerts table for anomaly detection
CREATE TABLE IF NOT EXISTS public.cost_alerts (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
    alert_type  TEXT NOT NULL CHECK (alert_type IN ('spike', 'anomaly', 'threshold', 'budget')),
    message     TEXT NOT NULL,
    severity    TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
    metadata    JSONB DEFAULT '{}',
    is_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cost_alerts_tenant ON public.cost_alerts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cost_alerts_severity ON public.cost_alerts(severity);

ALTER TABLE public.cost_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cost_alerts_tenant_select ON public.cost_alerts;

CREATE POLICY cost_alerts_tenant_select ON public.cost_alerts
    FOR SELECT
    TO authenticated
    USING (public.user_can_access_tenant(tenant_id));

CREATE POLICY cost_alerts_service_role ON public.cost_alerts
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
