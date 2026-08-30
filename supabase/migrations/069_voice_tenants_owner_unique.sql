-- POST /tenants (apps/gateway/src/services/voice/voice.controller.ts) does a
-- check-then-insert for onboarding idempotency: SELECT existing tenant by
-- owner_user_id, INSERT only if none found. With no uniqueness on
-- owner_user_id, two concurrent requests for the same user (a network retry,
-- two open tabs) can both pass the check and both insert, producing two
-- workspaces for one owner. This index lets the route switch to
-- ON CONFLICT (owner_user_id) DO NOTHING for a truly atomic check-and-create.
--
-- If this fails to apply, duplicate owner_user_id rows already exist —
-- find them first with:
--   select owner_user_id, count(*) from public.voice_tenants
--   group by owner_user_id having count(*) > 1;
-- and manually consolidate (merge or delete) the extras before retrying.
CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_tenants_owner_user_id_unique
  ON public.voice_tenants (owner_user_id);
