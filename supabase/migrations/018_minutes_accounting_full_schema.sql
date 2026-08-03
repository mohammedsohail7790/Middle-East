-- Bring minutes_accounting in line with gateway billing.service.ts (migration 016)

ALTER TABLE public.minutes_accounting
  ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL;

ALTER TABLE public.minutes_accounting
  ADD COLUMN IF NOT EXISTS duration_seconds integer;

ALTER TABLE public.minutes_accounting
  ADD COLUMN IF NOT EXISTS billed_minutes integer;

ALTER TABLE public.minutes_accounting
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'voice';

ALTER TABLE public.minutes_accounting
  ADD COLUMN IF NOT EXISTS is_trial boolean DEFAULT false;

ALTER TABLE public.minutes_accounting
  ADD COLUMN IF NOT EXISTS billing_period_start date;

ALTER TABLE public.minutes_accounting
  ADD COLUMN IF NOT EXISTS billing_period_end date;

UPDATE public.minutes_accounting
SET source = COALESCE(source, 'voice'),
    is_trial = COALESCE(is_trial, false),
    billing_period_start = COALESCE(billing_period_start, CURRENT_DATE),
    billing_period_end = COALESCE(billing_period_end, CURRENT_DATE)
WHERE source IS NULL
   OR is_trial IS NULL
   OR billing_period_start IS NULL
   OR billing_period_end IS NULL;

UPDATE public.minutes_accounting
SET duration_seconds = 60
WHERE duration_seconds IS NULL;

UPDATE public.minutes_accounting
SET billed_minutes = GREATEST(1, CEIL(duration_seconds::numeric / 60))
WHERE billed_minutes IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_minutes_accounting_call_dedup
  ON public.minutes_accounting (tenant_id, call_sid, source);
