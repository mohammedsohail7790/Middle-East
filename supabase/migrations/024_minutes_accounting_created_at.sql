-- Ensure minutes_accounting has created_at for daily usage charts
ALTER TABLE public.minutes_accounting
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

UPDATE public.minutes_accounting
SET created_at = COALESCE(
  created_at,
  (billing_period_start::timestamptz + interval '12 hours')
)
WHERE created_at IS NULL;
