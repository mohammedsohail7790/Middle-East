-- Post-call pipeline fixes (leads dedup, minutes accounting, call evaluations)
-- Run on Supabase if you see REALTIME_STORE_LEAD_FAILED / minutes_accounting / call_evaluations errors.

-- 1) Leads: storeLead uses ON CONFLICT (tenant_id, fingerprint)
DROP INDEX IF EXISTS public.idx_leads_fingerprint;
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_tenant_fingerprint_unique
  ON public.leads (tenant_id, fingerprint)
  WHERE fingerprint IS NOT NULL;

-- 2) Minutes accounting: dedupe per call (gateway billing.service.ts)
CREATE UNIQUE INDEX IF NOT EXISTS idx_minutes_accounting_call_dedup
  ON public.minutes_accounting (tenant_id, call_sid, source);

-- 3) Call evaluations (migration 009 may not have been applied)
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

DROP POLICY IF EXISTS "Users can view their tenant's call evaluations" ON public.call_evaluations;
CREATE POLICY "Users can view their tenant's call evaluations"
  ON public.call_evaluations FOR SELECT
  USING (tenant_id IN (SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid()));

DROP POLICY IF EXISTS "System can insert call evaluations" ON public.call_evaluations;
CREATE POLICY "System can insert call evaluations"
  ON public.call_evaluations FOR INSERT
  WITH CHECK (true);
