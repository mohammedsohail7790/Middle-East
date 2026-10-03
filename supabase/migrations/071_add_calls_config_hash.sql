-- voice.controller.ts#storeCall upserts calls.config_hash (a 12-char sha256 prefix of the
-- realtime instructions, see realtime.post-call.ts) but no earlier migration creates the
-- column, so a database built only from supabase/migrations/ fails every post-call write.
-- Additive and idempotent: a database that already has the column is left unchanged.
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS config_hash TEXT;

-- Rollback (manual, only if the column was created by this migration and is unused):
--   ALTER TABLE public.calls DROP COLUMN IF EXISTS config_hash;
