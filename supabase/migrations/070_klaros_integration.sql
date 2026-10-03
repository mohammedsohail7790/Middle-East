-- Klaros integration contract: external lead reference, outbound-call
-- association, structured qualification result, and idempotent webhook
-- delivery tracking. Additive only — no existing column is altered or
-- removed, so existing Halla clients remain unaffected.

-- 1. External lead reference (leads.klaros_lead_id survives through
--    create/update/status/assign lifecycle — see leads-schema.ts).
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS klaros_lead_id TEXT;
CREATE INDEX IF NOT EXISTS idx_leads_klaros_lead_id
  ON public.leads (klaros_lead_id)
  WHERE klaros_lead_id IS NOT NULL;

-- 2. Outbound call -> Klaros lead association, carried through to the
--    call.completed event payload.
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS klaros_lead_id TEXT;
CREATE INDEX IF NOT EXISTS idx_calls_klaros_lead_id
  ON public.calls (klaros_lead_id)
  WHERE klaros_lead_id IS NOT NULL;

-- 3. Structured qualification result (additive alongside existing
--    free-text outcome/call_disposition columns — see item 12 of the
--    Klaros integration contract). Defaults to 'unknown': never invented.
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS qualification_status TEXT
  DEFAULT 'unknown'
  CHECK (qualification_status IN ('qualified', 'not_qualified', 'needs_human_review', 'unknown'));
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS qualification_fields JSONB;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS qualification_missing JSONB;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS qualification_reason TEXT;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS qualification_confidence NUMERIC;

-- 4. Per-webhook event-delivery idempotency. event-idempotency.ts already
--    guards the platform event bus globally (one claim per eventId across
--    all consumers); this guards the Klaros webhook dispatcher specifically
--    against re-delivering the same (webhook, event) pair if the consumer
--    is restarted mid-batch before the global claim is marked processed.
ALTER TABLE public.webhook_deliveries ADD COLUMN IF NOT EXISTS event_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_event
  ON public.webhook_deliveries (webhook_id, event_id)
  WHERE event_id IS NOT NULL;

COMMENT ON COLUMN public.leads.klaros_lead_id IS 'External lead id supplied by Klaros — preserved through lead lifecycle, never discarded.';
COMMENT ON COLUMN public.calls.klaros_lead_id IS 'Klaros lead id associated with an outbound call at creation time.';
COMMENT ON COLUMN public.calls.qualification_status IS 'Structured qualification outcome exposed to Klaros; unknown unless explicitly established during the call.';
