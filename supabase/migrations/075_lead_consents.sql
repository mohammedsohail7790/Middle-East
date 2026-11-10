-- Medical Tourism consent evidence: one row per (explicit spoken decision, scope).
-- Additive only. NOT applied by this change: apply to staging first, then production, each with its own approval.
--
-- A row exists only because the `record_consent` tool was called after a caller gave an explicit answer. Pressing 1 to speak to
-- the AI never writes here. `wording_version` is the label the business configured (voice_tenants.metadata.consent_capture); the
-- consent wording text itself is deliberately NOT stored here or sent anywhere. `recorded_at` is the database clock.
-- Until a lead exists (consent is asked before details are saved) rows are keyed by call_sid; they are linked to the lead when it is
-- created or matched on that call.

CREATE TABLE IF NOT EXISTS public.lead_consents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  lead_id         UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  call_sid        TEXT,
  scope           TEXT NOT NULL CHECK (scope IN ('contact', 'store_personal_data', 'store_medical_information')),
  granted         BOOLEAN NOT NULL,
  method          TEXT NOT NULL CHECK (method IN ('voice_ai_verbal')),
  wording_version TEXT NOT NULL CHECK (wording_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'),
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lead_consents_has_anchor CHECK (lead_id IS NOT NULL OR call_sid IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_lead_consents_lead ON public.lead_consents (tenant_id, lead_id, scope, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_consents_call ON public.lead_consents (tenant_id, call_sid) WHERE call_sid IS NOT NULL;

-- Deny by default for the anon/authenticated API roles: no policy is created, so only the gateway's server connection reads or writes.
ALTER TABLE public.lead_consents ENABLE ROW LEVEL SECURITY;
