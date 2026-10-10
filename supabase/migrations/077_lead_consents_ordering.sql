-- Medical Tourism consent evidence: deterministic ordering (additive; apply after 075 and 076).
--
-- `recorded_at` previously defaulted to NOW(), which is the transaction START time, so two decisions could be stored out of wall-clock order.
-- The gateway now writes clock_timestamp() explicitly, and `seq` breaks any remaining tie in storage order, so "latest decision per scope"
-- (a withdrawal after a grant, then a re-grant) is always derived the same way.

ALTER TABLE public.lead_consents ADD COLUMN IF NOT EXISTS seq BIGSERIAL;
ALTER TABLE public.lead_consents ALTER COLUMN recorded_at SET DEFAULT clock_timestamp();
CREATE INDEX IF NOT EXISTS idx_lead_consents_order ON public.lead_consents (tenant_id, lead_id, recorded_at, seq);
