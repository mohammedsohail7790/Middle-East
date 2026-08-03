-- Production DBs may have legacy NOT NULL `minutes` (numeric) alongside billed_minutes.
-- Gateway 016+ only wrote billed_minutes, causing: null value in column "minutes".

ALTER TABLE public.minutes_accounting
  ALTER COLUMN minutes DROP NOT NULL;

UPDATE public.minutes_accounting
SET minutes = COALESCE(billed_minutes, GREATEST(1, CEIL(duration_seconds::numeric / 60)), 1)
WHERE minutes IS NULL;

CREATE OR REPLACE FUNCTION public.minutes_accounting_sync_legacy_minutes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.minutes IS NULL THEN
    NEW.minutes := COALESCE(
      NEW.billed_minutes,
      CASE
        WHEN NEW.duration_seconds IS NOT NULL AND NEW.duration_seconds > 0
        THEN GREATEST(1, CEIL(NEW.duration_seconds::numeric / 60))
        ELSE 1
      END
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_minutes_accounting_sync_legacy ON public.minutes_accounting;
CREATE TRIGGER trg_minutes_accounting_sync_legacy
  BEFORE INSERT ON public.minutes_accounting
  FOR EACH ROW
  EXECUTE FUNCTION public.minutes_accounting_sync_legacy_minutes();
