-- 073_halla_rls_helper_execute_privileges.sql
--
-- Closes a gap in 072 that only exists on hosted Supabase.
--
-- 072 ended with `REVOKE ALL ON FUNCTION ... FROM PUBLIC` on user_is_tenant_owner / user_is_tenant_admin. That removes
-- the PUBLIC grant, and on plain PostgreSQL that is all there is to remove. On Supabase, `postgres` carries default
-- privileges that grant EXECUTE on every new function in `public` DIRECTLY to anon, authenticated and service_role
-- (not through PUBLIC), so the revoke left `anon` able to execute both helpers. Verified on the Halla staging project
-- after 072 was applied. user_can_access_tenant (created before 072) was never revoked at all and is executable by
-- PUBLIC and anon.
--
-- The helpers only report whether the CALLER's own auth.uid() may reach a tenant, so for `anon` (auth.uid() is NULL)
-- they return false; this is not a data leak. It is still an unintended API surface (they are callable through
-- PostgREST /rpc), and the RLS design is that only signed-in users and the service role can evaluate them.
--
-- What this does, and nothing more:
--   * revokes EXECUTE from PUBLIC and, separately and explicitly, from anon, on all three helpers;
--   * grants EXECUTE to exactly authenticated and service_role.
-- It does not redefine, replace or alter the functions: bodies, return values, SECURITY DEFINER, STABLE and the pinned
-- `search_path = pg_catalog, public` are untouched. Explicit (uuid) signatures are used throughout.
--
-- Idempotent: REVOKE and GRANT of an existing state are no-ops. Forward-only like every migration here.

REVOKE ALL ON FUNCTION public.user_can_access_tenant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_access_tenant(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.user_is_tenant_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_is_tenant_owner(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.user_is_tenant_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_is_tenant_admin(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.user_can_access_tenant(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_is_tenant_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_is_tenant_admin(uuid) TO authenticated, service_role;
