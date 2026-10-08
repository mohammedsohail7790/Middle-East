# Halla production RLS rollout (072 + 073) — PREPARED, NOT EXECUTED

Project: "mohammedsohail7790's Project", ref `xzhxnxxlbiiidipcgfrv` (Free plan, **no provider backups**). Migration 074 (views) is **already applied** to production and is treated as DONE.
Nothing in this document has been run against production. Every number below was either measured on production (read-only, 2026-10-07/08) or measured on the Halla staging project through the same migrations.

## 0. Why, and what is at stake
Production's RLS is broken in two ways, both measured live on 2026-10-08:
- **49 tables** raise `infinite recursion detected in policy` for any non-bypass role (root cycle: `voice_tenants` ↔ `team_members`). Today this fails closed, because the gateway uses a privileged connection and the dashboard uses Supabase only for auth.
- **28 `true` policies**, **12 of them open to a role other than `service_role`** (including the PUBLIC `Service role can manage tenants` policy on `voice_tenants`), **5 tenant tables without RLS**, **only 1 of 3** RLS helpers, and **4 anon-executable SECURITY DEFINER functions**.
Fixing the recursion without removing the open policies would turn today's accidental fail-closed into an open door; that is why 072 and 073 must go together.

| Measure (SELECT-only queries in §3) | Production now | Expected after 072 + 073 |
|---|---|---|
| policies in `public` | 162 | **157** |
| open `true` policies | 28 | **17** (16 `service_role`-only + 1 allow-listed `integrations.integrations_read_all`) |
| open to a role other than `service_role` | 12 | **1** |
| RLS helpers present | 1 | **3** |
| SECURITY DEFINER functions executable by anon | 4 | **3** (`handle_new_user`, `user_can_access_org`, `user_is_org_member`; see §6) |
| tenant tables without RLS | 5 | **0** |
| PUBLIC `Service role can manage tenants` policy | 1 | **0** |
| tables raising a recursion error as `anon` | 49 | **0** |
| views reachable by an API role (074) | 0 | 0 (unchanged) |

## 1. Preconditions — ALL must be true, otherwise do not start
1. **A verified backup exists.** The Free plan has none. Take a `pg_dump` (custom format, `--schema=public`) with a production connection string copied from the Render gateway service's environment (**never reset the production password**). The direct host is IPv6-only; from a machine without IPv6 use a short-lived loopback relay as was done for staging. Save outside git, record size and SHA-256, and confirm with `pg_restore --list` that it holds 162 `POLICY public` entries.
   - Alternative: upgrade to Pro for point-in-time recovery (a purchase decision).
2. **Rehearse on a copy first.** Restore the backup into a throwaway database (local PostgreSQL with `tests/helpers/supabase-shim.sql`, or a second free Supabase project), apply 072 then 073, then run `rls-tenant-isolation.postgres.test.ts` (expect 18/18), `rls-view-security.postgres.test.ts` (expect 12/12) and the catalog audit (expect 0 violations). Do **not** run the fixture-writing suites on production itself.
3. **Pre-state matches this document.** Run §3's queries on production; the "now" column must match exactly. Any difference means drift: stop and re-derive the rollback.
4. **The gateway does not depend on RLS.** It connects with a privileged role (it works today despite 49 recursive tables, which proves it bypasses RLS); the dashboard reads data through the gateway. Confirm no other client (Zapier, scripts, Supabase client in the browser) reads tables as `anon`/`authenticated`.
5. **Change window, no deploy in flight.** Render production auto-deploys from `main`: do not merge during the window.
6. Migration files are byte-identical to the tested ones:
   - `072_halla_rls_hardening.sql` sha256 `2935aa36fdd3ed34cf4584295834688422b4c6cafa4e0b7c2979d27325c60a87` (12,794 bytes; git blob `2a2e2474…`)
   - `073_halla_rls_helper_execute_privileges.sql` sha256 `9cfef7c8d8180bb721280dfcd602d21545975db79a2d3568adcc14976e349a90` (2,294 bytes; git blob `7fac87d8…`)

## 2. Procedure (each file is one request = one implicit transaction; neither contains BEGIN/COMMIT)
1. Paste **072** into the production SQL editor (copy the file via the clipboard, never retype) and run it. Confirm "Success".
2. Run the §3 checks. Expected after 072 alone: helpers 3, tables without RLS 0, recursion 0, but **anon-executable definers = 6** (the 4 existing plus the two new helpers, which Supabase's default privileges make anon-executable until 073 revokes it; 073 then takes it to 3).
3. Paste **073** and run it.
4. Run the full §3 checks again: every row must equal the "after" column.
5. Smoke test: dashboard login, tenant dashboard, team members, workforce page (all go through the gateway).

## 3. Verification — read-only (SELECT only)
```sql
-- summary (one row)
select (select count(*) from pg_policies where schemaname='public')::int as policies,
 (select count(*) from pg_policies where schemaname='public' and (qual='true' or with_check='true'))::int as open_true,
 (select count(*) from pg_policies where schemaname='public' and (qual='true' or with_check='true') and roles::text <> '{service_role}')::int as open_non_service,
 (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('user_can_access_tenant','user_is_tenant_owner','user_is_tenant_admin'))::int as helpers_present,
 (select count(*) from pg_proc where pronamespace='public'::regnamespace and prosecdef and has_function_privilege('anon',oid,'EXECUTE'))::int as definers_anon_exec,
 (select count(distinct c.relname) from pg_class c join information_schema.columns k on k.table_name=c.relname and k.table_schema='public' and k.column_name='tenant_id' where c.relnamespace='public'::regnamespace and c.relkind='r' and not c.relrowsecurity)::int as tenant_tables_no_rls,
 (select count(*) from pg_policies where schemaname='public' and policyname='Service role can manage tenants')::int as voice_tenants_public_policy;
```
```sql
-- helper privileges: expect anon=false, public=false, authenticated=true, service_role=true for all three
select proname, has_function_privilege('anon',oid,'EXECUTE') anon, has_function_privilege('public',oid,'EXECUTE') pub,
       has_function_privilege('authenticated',oid,'EXECUTE') authenticated, has_function_privilege('service_role',oid,'EXECUTE') service_role,
       prosecdef, coalesce(proconfig::text,'') cfg
from pg_proc where pronamespace='public'::regnamespace and proname in ('user_can_access_tenant','user_is_tenant_owner','user_is_tenant_admin') order by 1;
```
```sql
-- runtime recursion probe (SELECT only; ends in a deliberate exception that prints the result). Expect: recursive_tables=0 list=
do $$ declare t record; n int := 0; l text := ''; begin
  for t in select c.relname from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' and c.relrowsecurity loop
    begin set local role anon; execute format('select 1 from public.%I where false', t.relname); reset role;
    exception when sqlstate '42P17' then n := n + 1; l := l || t.relname || ','; when others then null; end;
  end loop; raise exception 'recursive_tables=% list=%', n, l; end $$;
```
**Tenant-isolation tests.** The behavioural proof (tenant A↔B reads and writes, anon and tenant-less denial, secret and escalation-number isolation, owner/admin rules, six mutation tests) is `tests/integration/rls-tenant-isolation.postgres.test.ts` and `rls-view-security.postgres.test.ts`. They write synthetic fixtures, so run them on the **rehearsal copy and on staging (done: 18/18 and 12/12, catalog audit 0)**, never on production. On production the proof is the three read-only queries above.

## 4. Rollback
- **Primary: restore the §1.1 backup.**
- **Secondary (072/073 only): `C:\Users\User\halla-prod-rollback\072_073_rollback_production.sql`** (outside git; sha256 `30d54915e92e586bb8eafc6e806aad28fb0140c72a9dfc7f6cb01c2d64eb83b2`). Generated from the exact pre-072 schema (`pg_restore` of the staging backup); one transaction; does **not** touch 074. **Tested on the real hosted staging database**: after the rollback staging measured exactly production's pre-state `162 / 28 / 12 / 1 / 4 / 5 / 1 / 49`, then re-applying 072 + 073 returned to `157 / 17 / 1 / 3 / 3 / 0 / 0 / 0` with the catalog audit at 0 violations and the sandbox data intact.
- Caveat: the rollback **re-opens the vulnerabilities**. Prefer a forward fix. Staging differs from production in one respect: its five formerly RLS-less tables already had RLS (the rollback's step 4 disables it, matching production's measured state).

## 5. Abort criteria
Any §3 value differing from "after"; any error from 072/073 (they roll back atomically, nothing changes); the dashboard smoke test failing; the pre-state not matching §0.

## 6. Residual after this rollout (separate migration, not part of it)
- 3 SECURITY DEFINER functions stay anon-executable: `handle_new_user` (trigger function), `user_can_access_org`, `user_is_org_member`. They return booleans about the caller (anon → false), so low risk; revoke from `PUBLIC`/`anon` in a follow-up migration after confirming no policy relies on anon execution.
- The Data API exposes 95 of 101 tables and 151 of 151 functions with "Automatically expose new tables" ON: turn it off (Supabase's own recommendation) so new objects are not granted to API roles by default.
- Production has no backups on the Free plan; this should be fixed regardless of this rollout.
