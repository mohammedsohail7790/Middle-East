-- Migration 044: Add missing indexes on foreign key columns
-- These FKs exist but lack indexes, causing full-table scans on JOINs

-- sms_messages: missing indexes on lead_id and call_id
CREATE INDEX IF NOT EXISTS idx_sms_messages_lead_id
  ON public.sms_messages (lead_id)
  WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sms_messages_call_id
  ON public.sms_messages (call_id)
  WHERE call_id IS NOT NULL;

-- leads: missing index on call_id
CREATE INDEX IF NOT EXISTS idx_leads_call_id
  ON public.leads (call_id)
  WHERE call_id IS NOT NULL;

-- minutes_accounting: missing index on subscription_id
CREATE INDEX IF NOT EXISTS idx_minutes_accounting_subscription_id
  ON public.minutes_accounting (subscription_id)
  WHERE subscription_id IS NOT NULL;

-- integration_audit_log: missing index on user_id
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'integration_audit_log') THEN
    CREATE INDEX IF NOT EXISTS idx_integration_audit_log_user_id
      ON public.integration_audit_log (user_id)
      WHERE user_id IS NOT NULL;
  END IF;
END;
$$;

-- call_evaluations: missing index on call_id
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'call_evaluations') THEN
    CREATE INDEX IF NOT EXISTS idx_call_evaluations_call_id
      ON public.call_evaluations (call_id);
  END IF;
END;
$$;

-- Additional composite indexes for common query patterns
-- calls: tenant + outcome (common filter)
CREATE INDEX IF NOT EXISTS idx_calls_tenant_outcome
  ON public.calls (tenant_id, outcome)
  WHERE outcome IS NOT NULL;

-- leads: tenant + status (common filter in dashboard)
CREATE INDEX IF NOT EXISTS idx_leads_tenant_status
  ON public.leads (tenant_id, status);

-- appointments: tenant + status (common filter)
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_status
  ON public.appointments (tenant_id, status);

-- sms_messages: tenant + direction + created_at (common dashboard query)
CREATE INDEX IF NOT EXISTS idx_sms_messages_tenant_direction
  ON public.sms_messages (tenant_id, direction, created_at DESC);
