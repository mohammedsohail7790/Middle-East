-- Some older prod databases may not have `voice_tenants.email` applied.
-- The automation layer uses tenant email only optionally, so we add it as nullable.

ALTER TABLE public.voice_tenants
  ADD COLUMN IF NOT EXISTS email TEXT;

