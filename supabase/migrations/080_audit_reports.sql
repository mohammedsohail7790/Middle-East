-- 080: Opportunity Audit reports
-- Until now the paid audit stored nothing: answers and payments reached the team by email. The automatic report needs a record per audit:
-- the client's answers, the AI draft (edited by the team), its status, and when it was approved, paid and delivered.
-- Not tied to a tenant (the audit is sold to prospects, not to tenants). No client or browser role can read it: RLS is on, there are no policies,
-- and access is revoked; only the gateway's own database role reads and writes it. Additive only.

CREATE TABLE IF NOT EXISTS public.audit_reports (
  id            TEXT PRIMARY KEY,                       -- the audit's link id, shown in the emails
  company       TEXT NOT NULL,
  email         TEXT NOT NULL,
  contact_name  TEXT,
  currency      TEXT NOT NULL DEFAULT 'AED',
  lang          TEXT NOT NULL DEFAULT 'en' CHECK (lang IN ('en', 'ar')),
  answers       JSONB NOT NULL,
  report        JSONB,                                  -- the AI draft, then the team's edits
  assessment    JSONB,                                  -- the labelled facts the price is worked out from
  status        TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'draft_failed', 'in_review', 'approved', 'paid', 'delivered', 'delivery_failed')),
  approved_at   TIMESTAMPTZ,
  paid_at       TIMESTAMPTZ,
  delivered_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_reports_status_idx ON public.audit_reports (status, updated_at DESC);

ALTER TABLE public.audit_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_reports FROM anon, authenticated;
