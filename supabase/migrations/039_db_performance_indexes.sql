-- Composite indexes for tenant-scoped list/sort queries (audit 2026-06).

CREATE INDEX IF NOT EXISTS idx_calls_tenant_created_at
  ON public.calls (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leads_tenant_created_at
  ON public.leads (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leads_tenant_score_created
  ON public.leads (tenant_id, score DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leads_tenant_phone
  ON public.leads (tenant_id, phone);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_created
  ON public.invoices (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sms_messages_tenant_phone_created
  ON public.sms_messages (tenant_id, phone_number, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_appointments_tenant_scheduled
  ON public.appointments (tenant_id, scheduled_time);

CREATE INDEX IF NOT EXISTS idx_appointments_reminder_scan
  ON public.appointments (scheduled_time)
  WHERE status = 'booked';
