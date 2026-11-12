-- 082: Persistent scheduler
-- Appointment reminders, campaign dialling and retries used to live in process memory (setInterval / setTimeout) and were lost on every restart.
-- This table is the source of truth for "something that must happen at a given time". The gateway polls it with FOR UPDATE SKIP LOCKED, so two
-- instances never take the same job. Redis is not used for this: it runs with an eviction policy and may drop keys.
-- Written and read by the gateway only: RLS is on, there are no policies, and browser roles have no access. Additive only.

CREATE TABLE IF NOT EXISTS public.scheduled_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('appointment_reminder', 'campaign_dial')),
  channel       TEXT,                                           -- reminders: email | whatsapp
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  campaign_id   UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  dedupe_key    TEXT NOT NULL UNIQUE,                           -- the same reminder or call is never queued twice
  run_at        TIMESTAMPTZ NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'processing', 'done', 'failed', 'skipped', 'cancelled', 'abandoned')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  max_attempts  INTEGER NOT NULL DEFAULT 3,
  locked_until  TIMESTAMPTZ,                                    -- lease: a worker that dies mid-send never sends again, the job is marked abandoned
  locked_by     TEXT,
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS scheduled_jobs_due_idx ON public.scheduled_jobs (run_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS scheduled_jobs_lease_idx ON public.scheduled_jobs (locked_until) WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS scheduled_jobs_campaign_idx ON public.scheduled_jobs (campaign_id, status) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS scheduled_jobs_tenant_idx ON public.scheduled_jobs (tenant_id, created_at DESC);

ALTER TABLE public.scheduled_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scheduled_jobs FROM anon, authenticated;

-- Campaigns: when they may dial (in which timezone, which hours, which weekdays) and what to dial with.
-- schedule_at and the paused / cancelled statuses already exist on this table.
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS timezone         TEXT,                                      -- null = the business's own timezone
  ADD COLUMN IF NOT EXISTS calling_start    TIME NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS calling_end      TIME NOT NULL DEFAULT '20:00',
  ADD COLUMN IF NOT EXISTS calling_days     SMALLINT[] NOT NULL DEFAULT '{1,2,3,4,5,6,7}',  -- ISO weekdays, 1 = Monday
  ADD COLUMN IF NOT EXISTS dial_from_number TEXT,
  ADD COLUMN IF NOT EXISTS dial_agent_id    TEXT,
  ADD COLUMN IF NOT EXISTS dial_max_attempts SMALLINT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS paused_at        TIMESTAMPTZ;
