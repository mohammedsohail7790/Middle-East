-- Align minutes_accounting with gateway billing.service.ts (016 schema).
-- Safe on prod DBs that were created with missing or legacy columns.

ALTER TABLE public.minutes_accounting
  ADD COLUMN IF NOT EXISTS duration_seconds integer;

ALTER TABLE public.minutes_accounting
  ADD COLUMN IF NOT EXISTS billed_minutes integer;

-- Backfill duration_seconds from legacy column names (if present)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'minutes_accounting'
      AND column_name = 'duration_ms'
  ) THEN
    UPDATE public.minutes_accounting
    SET duration_seconds = GREATEST(
      1,
      CEIL(COALESCE(duration_seconds, duration_ms)::numeric / 1000)
    )
    WHERE duration_seconds IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'minutes_accounting'
      AND column_name = 'minutes'
  ) THEN
    UPDATE public.minutes_accounting
    SET duration_seconds = GREATEST(1, COALESCE(duration_seconds, minutes * 60))
    WHERE duration_seconds IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'minutes_accounting'
      AND column_name = 'duration'
  ) THEN
    UPDATE public.minutes_accounting
    SET duration_seconds = GREATEST(1, COALESCE(duration_seconds, duration))
    WHERE duration_seconds IS NULL;
  END IF;
END $$;

-- Default any rows still missing duration
UPDATE public.minutes_accounting
SET duration_seconds = 60
WHERE duration_seconds IS NULL;

-- Derive billed_minutes from duration_seconds (never from billed_minutes itself)
UPDATE public.minutes_accounting
SET billed_minutes = GREATEST(1, CEIL(duration_seconds::numeric / 60))
WHERE billed_minutes IS NULL;

-- Enforce NOT NULL only when data is clean
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.minutes_accounting WHERE duration_seconds IS NULL
  ) THEN
    ALTER TABLE public.minutes_accounting
      ALTER COLUMN duration_seconds SET NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.minutes_accounting WHERE billed_minutes IS NULL
  ) THEN
    ALTER TABLE public.minutes_accounting
      ALTER COLUMN billed_minutes SET NOT NULL;
  END IF;
END $$;
