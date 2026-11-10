-- Medical Tourism consent evidence: durable notification intent for "a consent decision was stored" (additive; apply after 075).
--
-- record_consent writes one row here BEFORE it writes the decision rows. A sweeper (and an immediate attempt) turns each pending row into a
-- lead.updated platform event carrying freshly derived evidence, and stamps delivered_at only when the event was added to the Redis stream.
-- If Redis is down or the event bus is disabled the row stays pending and is retried; nothing is lost silently. No personal data,
-- wording text or medical content is stored here: only tenant, call id and delivery bookkeeping.

CREATE TABLE IF NOT EXISTS public.lead_consent_outbox (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  call_sid     TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  attempts     INTEGER NOT NULL DEFAULT 0,
  last_outcome TEXT
);

CREATE INDEX IF NOT EXISTS idx_lead_consent_outbox_pending ON public.lead_consent_outbox (id) WHERE delivered_at IS NULL;

-- Deny by default for the anon/authenticated API roles (no policy): only the gateway's server connection reads or writes.
ALTER TABLE public.lead_consent_outbox ENABLE ROW LEVEL SECURITY;
