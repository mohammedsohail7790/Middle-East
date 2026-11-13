-- 085: Automation engine
-- A business turns on ready-made automations (from a library of templates), each with its own settings and an approval mode: run by itself, or ask the owner first.
-- Every run is logged step by step so the owner can see exactly what happened, and every action that needs the owner's yes waits as an approval.
-- Written and read by the gateway only: RLS is on, there are no policies, and browser roles have no access. Additive only.

CREATE TABLE IF NOT EXISTS public.tenant_automations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  template_key  TEXT NOT NULL,                              -- which ready-made automation this is (see the template library in the gateway)
  name          TEXT NOT NULL,
  enabled       BOOLEAN NOT NULL DEFAULT false,             -- nothing runs until the owner turns it on
  approval_mode TEXT NOT NULL DEFAULT 'ask' CHECK (approval_mode IN ('auto', 'ask')),
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,         -- the owner's settings for this automation
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, template_key)
);
CREATE INDEX IF NOT EXISTS tenant_automations_tenant_idx ON public.tenant_automations (tenant_id, enabled);

CREATE TABLE IF NOT EXISTS public.tenant_automation_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  automation_id   UUID NOT NULL REFERENCES public.tenant_automations(id) ON DELETE CASCADE,
  trigger_kind    TEXT NOT NULL,                            -- e.g. lead.created, call.ended, call.missed, appointment.created, document.received, manual
  trigger_ref     TEXT NOT NULL,                            -- what started it (a lead id, call id, ...): the same trigger never runs the same automation twice
  trigger_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'waiting_approval', 'succeeded', 'failed', 'skipped', 'rejected')),
  steps           JSONB NOT NULL DEFAULT '[]'::jsonb,       -- the log: [{ index, key, status, startedAt, finishedAt, summary, error }]
  error           TEXT,
  minutes_saved   NUMERIC(6, 2) NOT NULL DEFAULT 0,         -- an estimate of the staff time this run saved, set when it succeeds
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ,
  UNIQUE (automation_id, trigger_kind, trigger_ref)
);
CREATE INDEX IF NOT EXISTS tenant_automation_runs_tenant_idx ON public.tenant_automation_runs (tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS tenant_automation_runs_status_idx ON public.tenant_automation_runs (tenant_id, status);

CREATE TABLE IF NOT EXISTS public.tenant_automation_approvals (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  run_id     UUID NOT NULL REFERENCES public.tenant_automation_runs(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  step_key   TEXT NOT NULL,
  summary    TEXT NOT NULL,                                 -- plain words: what the automation wants to do
  proposal   JSONB NOT NULL DEFAULT '{}'::jsonb,            -- the exact action, shown to the owner and carried out only if approved
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  UNIQUE (run_id, step_index)
);
CREATE INDEX IF NOT EXISTS tenant_automation_approvals_pending_idx ON public.tenant_automation_approvals (tenant_id, status, created_at DESC);

ALTER TABLE public.tenant_automations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_automation_runs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_automation_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_automations, public.tenant_automation_runs, public.tenant_automation_approvals FROM anon, authenticated;
