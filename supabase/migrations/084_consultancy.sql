-- 084: Consultancy pipeline
-- Everything the consultancy side needs after the Opportunity Audit: the prospects (fit-check leads), the build proposals a client accepts in writing,
-- the delivery projects and their milestones, the monthly support plans with the hours worked, and a server-side copy of the long audit form.
-- Written and read by the gateway only: RLS is on, there are no policies, and browser roles have no access. Additive only.

CREATE TABLE IF NOT EXISTS public.consultancy_leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source          TEXT NOT NULL DEFAULT 'fit_check' CHECK (source IN ('fit_check', 'consult_request', 'manual')),
  company         TEXT,
  contact_name    TEXT,
  email           TEXT,
  phone           TEXT,
  country         TEXT,
  answers         JSONB NOT NULL DEFAULT '{}'::jsonb,       -- the fit-check answers as submitted
  status          TEXT NOT NULL DEFAULT 'new' CHECK (status IN
                  ('new', 'approved', 'form_sent', 'form_received', 'audit_in_review', 'audit_paid', 'proposal_sent', 'won', 'lost')),
  notes           TEXT,
  owner_email     TEXT,                                      -- the team member looking after this prospect
  audit_report_id UUID REFERENCES public.audit_reports(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consultancy_leads_status_idx ON public.consultancy_leads (status, created_at DESC);
CREATE INDEX IF NOT EXISTS consultancy_leads_email_idx ON public.consultancy_leads (lower(email));

CREATE TABLE IF NOT EXISTS public.consultancy_proposals (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id            UUID NOT NULL REFERENCES public.consultancy_leads(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  scope              TEXT NOT NULL DEFAULT '',
  items              JSONB NOT NULL DEFAULT '[]'::jsonb,     -- [{ title, priceMinor }]
  currency           TEXT NOT NULL DEFAULT 'AED',
  total_minor        BIGINT NOT NULL CHECK (total_minor >= 0),
  delivery_weeks     INTEGER,
  valid_until        TIMESTAMPTZ NOT NULL,
  language           TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'ar')),
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'expired', 'withdrawn')),
  sent_at            TIMESTAMPTZ,
  accepted_at        TIMESTAMPTZ,
  accepted_name      TEXT,                                   -- the name the client typed to accept
  accepted_ip        TEXT,
  accepted_user_agent TEXT,
  terms_hash         TEXT,                                   -- fingerprint of the exact terms the client saw when accepting
  declined_reason    TEXT,
  created_by         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consultancy_proposals_lead_idx ON public.consultancy_proposals (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS consultancy_proposals_status_idx ON public.consultancy_proposals (status);

CREATE TABLE IF NOT EXISTS public.consultancy_projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id   UUID UNIQUE REFERENCES public.consultancy_proposals(id) ON DELETE SET NULL,
  lead_id       UUID NOT NULL REFERENCES public.consultancy_leads(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'delivered', 'on_hold', 'cancelled')),
  starts_on     DATE,
  delivery_date DATE,                                        -- the date written into the agreement
  delivered_at  TIMESTAMPTZ,
  handover      JSONB NOT NULL DEFAULT '{"code": false, "data": false, "accounts": false, "documentation": false}'::jsonb,
  client_notes  TEXT,                                        -- shown to the client on their status page
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consultancy_projects_lead_idx ON public.consultancy_projects (lead_id);
CREATE INDEX IF NOT EXISTS consultancy_projects_status_idx ON public.consultancy_projects (status);

CREATE TABLE IF NOT EXISTS public.consultancy_milestones (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.consultancy_projects(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  due_on     DATE,
  done_at    TIMESTAMPTZ,
  note       TEXT,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consultancy_milestones_project_idx ON public.consultancy_milestones (project_id, position);

CREATE TABLE IF NOT EXISTS public.consultancy_support_plans (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id                    UUID NOT NULL REFERENCES public.consultancy_leads(id) ON DELETE CASCADE,
  project_id                 UUID REFERENCES public.consultancy_projects(id) ON DELETE SET NULL,
  kind                       TEXT NOT NULL CHECK (kind IN ('standard', 'extended', 'partner', 'training')),
  currency                   TEXT NOT NULL DEFAULT 'AED',
  price_minor                BIGINT NOT NULL CHECK (price_minor >= 0),
  hours_included             NUMERIC(6, 2) NOT NULL DEFAULT 0,  -- per month (standard 4, extended 6)
  status                     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'past_due', 'cancelled')),
  stripe_checkout_session_id TEXT,
  stripe_subscription_id     TEXT,
  started_on                 DATE,
  cancelled_at               TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consultancy_support_plans_lead_idx ON public.consultancy_support_plans (lead_id);
CREATE UNIQUE INDEX IF NOT EXISTS consultancy_support_plans_sub_idx ON public.consultancy_support_plans (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.consultancy_support_hours (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  support_plan_id UUID NOT NULL REFERENCES public.consultancy_support_plans(id) ON DELETE CASCADE,
  worked_on       DATE NOT NULL DEFAULT CURRENT_DATE,
  hours           NUMERIC(5, 2) NOT NULL CHECK (hours > 0),
  note            TEXT,
  logged_by       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consultancy_support_hours_plan_idx ON public.consultancy_support_hours (support_plan_id, worked_on DESC);

-- The long audit form (about 20 minutes) used to be saved only in the client's browser. This keeps a copy per private link so it can be resumed on another device.
CREATE TABLE IF NOT EXISTS public.audit_form_drafts (
  token_hash TEXT PRIMARY KEY,                               -- SHA-256 of the private link token, never the token itself
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.consultancy_leads         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultancy_proposals     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultancy_projects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultancy_milestones    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultancy_support_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultancy_support_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_form_drafts         ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.consultancy_leads, public.consultancy_proposals, public.consultancy_projects, public.consultancy_milestones,
              public.consultancy_support_plans, public.consultancy_support_hours, public.audit_form_drafts FROM anon, authenticated;
