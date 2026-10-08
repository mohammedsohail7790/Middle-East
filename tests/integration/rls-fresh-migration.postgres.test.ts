/**
 * Fresh-database migration proof (REAL PostgreSQL): the RLS fix is carried by a MIGRATION, not by a manual patch of an
 * existing database, and no later migration silently recreates a vulnerable policy.
 *
 * It builds a brand-new database, applies the test-only Supabase shim, supabase/schema.sql and the migrations in order:
 *   1. 001..071  -> the policy audit MUST find the original defects (proves this environment really reproduces them);
 *   2. + 072     -> the audit and the isolation check must be clean;
 *   3. 072 again -> still clean (idempotent), and nothing else changed;
 *   4. every migration after 072 (if any are ever added) must leave it clean.
 *
 * Down-migrations: the repository has none by design (supabase/migrations is forward-only), so "downgrade" is not
 * applicable; the migration header explains why a rollback would have to recreate the vulnerable policies.
 *
 * Needs HALLA_TEST_DATABASE_URL (any superuser connection on a throwaway server; the scratch database is created and dropped here).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import pg from 'pg';
import { catalogViolations, grantApiRolesOnBaseTables, isolationViolations, loginRoleRunner, seedFixture, type Fixture } from '../helpers/rls-audit.js';

const DATABASE_URL = process.env.HALLA_TEST_DATABASE_URL;
const run = Boolean(DATABASE_URL);
const ROOT = path.resolve(__dirname, '../..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase/migrations');
const migrationFiles = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort();
const RLS_MIGRATION = migrationFiles.find((f) => f.startsWith('072_'))!;
const HELPER_MIGRATION = migrationFiles.find((f) => f.startsWith('073_'))!;
const VIEW_MIGRATION = migrationFiles.find((f) => f.startsWith('074_'))!;

describe.skipIf(!run)('fresh database: schema + migrations 001..latest', () => {
  const dbName = `halla_rls_fresh_${randomUUID().slice(0, 8)}`;
  let admin: pg.Client;
  let fresh: pg.Client;
  const q = (sql: string, params: unknown[] = []) => fresh.query(sql, params as never[]);
  const applyFile = async (file: string) => {
    await fresh.query(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
  };

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DATABASE_URL });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(DATABASE_URL!);
    url.pathname = `/${dbName}`;
    fresh = new pg.Client({ connectionString: url.toString() });
    await fresh.connect();
    await fresh.query(readFileSync(path.join(ROOT, 'tests/helpers/supabase-shim.sql'), 'utf8'));
    await fresh.query(readFileSync(path.join(ROOT, 'supabase/schema.sql'), 'utf8'));
  }, 120_000);

  afterAll(async () => {
    await fresh?.end().catch(() => {});
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => {});
    await admin?.end().catch(() => {});
  });

  it('the migration set is what the repository says: contiguous 001..N, 072 present, forward-only', () => {
    expect(migrationFiles.length).toBeGreaterThanOrEqual(74);
    migrationFiles.forEach((f, i) => expect(Number(f.slice(0, 3)), f).toBe(i + 1));
    expect(RLS_MIGRATION).toBe('072_halla_rls_hardening.sql');
    expect(HELPER_MIGRATION).toBe('073_halla_rls_helper_execute_privileges.sql');
    expect(VIEW_MIGRATION).toBe('074_harden_security_definer_views.sql');
    expect(migrationFiles.some((f) => /down|rollback/i.test(f))).toBe(false);
  });

  it('migrations 001..071 apply cleanly to an empty database', async () => {
    for (const f of migrationFiles.filter((m) => Number(m.slice(0, 3)) < 72)) {
      try {
        await applyFile(f);
      } catch (e) {
        throw new Error(`${f}: ${(e as Error).message}`);
      }
    }
    const n = (await q(`SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = 'public'`)).rows[0].n;
    expect(n).toBeGreaterThan(100);
  }, 300_000);

  it('BEFORE 072 the original defects are present (the environment reproduces them)', async () => {
    const v = (await catalogViolations(q)).join('\n');
    expect(v).toMatch(/open "true" policy .*voice_tenants/);
    expect(v).toMatch(/policy dependency cycle \(recursion\): .*(voice_tenants|team_members)/);
    expect(v).toMatch(/tenant table WITHOUT RLS: call_spam_log/);
    expect(v).toMatch(/open "true" policy .*invoices/);
    expect(v).toMatch(/open "true" policy .*knowledge_base/);
  });

  it('BEFORE 072 a non-bypass role really does hit "infinite recursion detected in policy"', async () => {
    const user = (await q(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [`pre-${randomUUID()}@test.local`])).rows[0].id;
    await q(`GRANT USAGE ON SCHEMA public TO authenticated`);
    await q(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated`);
    await q('BEGIN');
    try {
      await q('SET LOCAL ROLE authenticated');
      await q(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [user]);
      await expect(q(`SELECT * FROM public.ai_agents`)).rejects.toThrow(/infinite recursion detected in policy/);
    } finally {
      await q('ROLLBACK');
    }
    await q(`DELETE FROM auth.users WHERE id = $1`, [user]);
  });

  it('applying 072 fixes the POLICIES; with Supabase-like default privileges only helper EXECUTE grants and view grants remain (what 073 and 074 close)', async () => {
    await applyFile(RLS_MIGRATION);
    const v = await catalogViolations(q);
    // These reproduce the findings from the Halla staging project. REVOKE ... FROM PUBLIC does not remove the grant that
    // Supabase's default privileges give anon directly, and every public view is granted to anon/authenticated by default.
    // Everything else (open policies, recursion, RLS) must already be clean.
    expect(v).toContain('RLS helper user_is_tenant_admin is executable by anon');
    expect(v).toContain('RLS helper user_is_tenant_owner is executable by anon');
    expect(v).toContain('view integration_status is accessible to anon');
    expect(v).toContain('view v_tenant_me_channels is accessible to anon');
    for (const x of v) expect(x).toMatch(/^(RLS helper \w+ is executable by (anon|PUBLIC)|view \w+ is accessible to (anon|authenticated|PUBLIC))$/);
  });

  it('applying 073 closes the helper grants; only the view exposure remains (what 074 closes)', async () => {
    await applyFile(HELPER_MIGRATION);
    const v = await catalogViolations(q);
    expect(v.length).toBeGreaterThan(0);
    for (const x of v) expect(x).toMatch(/^view \w+ is accessible to (anon|authenticated|PUBLIC)$/);
  });

  it('applying 074 closes it: no open policy, no recursion, RLS everywhere, no helper or view reachable by anon, authenticated or PUBLIC', async () => {
    await applyFile(VIEW_MIGRATION);
    expect(await catalogViolations(q)).toEqual([]);
  });

  it('after 072 + 073 + 074, isolation holds for a non-bypass role on the freshly migrated schema', async () => {
    await grantApiRolesOnBaseTables(q as never); // base tables only: `ON ALL TABLES` would re-grant the views migration 074 locked down
    const role =`halla_rls_fresh_${randomUUID().slice(0, 8)}`;
    const password = `p_${randomUUID()}`;
    await q(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${password}' IN ROLE authenticated, anon`);
    const fx: Fixture = await seedFixture(q as never, 'fresh');
    const url = new URL(DATABASE_URL!);
    url.pathname = `/${dbName}`;
    url.username = role;
    url.password = password;
    const app = new pg.Client({ connectionString: url.toString() });
    await app.connect();
    try {
      expect(await isolationViolations(loginRoleRunner(app), fx)).toEqual([]);
    } finally {
      await app.end();
    }
  }, 120_000);

  it('072, 073 and 074 are idempotent: re-applying them changes no policy, no helper privilege and no view privilege or option', async () => {
    const snapshot = async () => ({
      viewAcls: (await q(`SELECT c.relname, c.relacl::text AS acl, c.reloptions::text AS opts FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'v' ORDER BY 1`)).rows,
      policies: (await q(`SELECT tablename, policyname, roles::text, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public' ORDER BY 1, 2`)).rows,
      helperAcls: (await q(`SELECT proname, proacl::text AS acl, prosecdef, proconfig::text AS cfg FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('user_can_access_tenant','user_is_tenant_owner','user_is_tenant_admin') ORDER BY 1`)).rows,
    });
    const before = await snapshot();
    await applyFile(RLS_MIGRATION);
    await applyFile(HELPER_MIGRATION);
    await applyFile(VIEW_MIGRATION);
    expect(await snapshot()).toEqual(before);
    expect(await catalogViolations(q)).toEqual([]);
  });

  it('073 only changes privileges: the helpers stay SECURITY DEFINER, STABLE, with the pinned search_path', async () => {
    const rows = (await q(`SELECT proname, prosecdef, provolatile, proconfig::text AS cfg FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('user_can_access_tenant','user_is_tenant_owner','user_is_tenant_admin') ORDER BY 1`)).rows;
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.prosecdef).toBe(true);
      expect(r.provolatile).toBe('s');
      expect(String(r.cfg)).toContain('search_path=pg_catalog, public');
    }
  });

  it('074 only changes view options and privileges: the definitions are untouched and service_role keeps SELECT only', async () => {
    const opts = (await q(`SELECT c.relname, coalesce(c.reloptions::text, '') AS opts FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'v' AND c.relname IN ('integration_status','v_tenant_me_channels','known_feature_flags') ORDER BY 1`)).rows;
    expect(opts).toEqual([
      { relname: 'integration_status', opts: '{security_invoker=true}' },
      { relname: 'known_feature_flags', opts: '' },
      { relname: 'v_tenant_me_channels', opts: '{security_invoker=true}' },
    ]);
    const svc = (await q(`SELECT c.relname, has_table_privilege('service_role', c.oid, 'SELECT') AS sel, has_table_privilege('service_role', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS other FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'v' AND c.relname IN ('integration_status','v_tenant_me_channels','known_feature_flags') ORDER BY 1`)).rows;
    expect(svc).toHaveLength(3);
    for (const r of svc) expect(r).toMatchObject({ sel: true, other: false });
    const def = (await q(`SELECT pg_get_viewdef('public.integration_status'::regclass, true) AS d`)).rows[0].d as string;
    expect(def).toMatch(/FROM voice_tenants/);
    expect(def).not.toMatch(/WHERE/i); // the definition is unchanged: still every row, which is exactly why it must not be client-readable
  });

  it('every migration after 074 (none today) leaves the audit clean', async () => {
    for (const f of migrationFiles.filter((m) => Number(m.slice(0, 3)) > 74)) {
      await applyFile(f);
      expect(await catalogViolations(q), `after ${f}`).toEqual([]);
    }
  });

  it('no migration other than 072 contains a policy that this migration removes and that would be re-created later', () => {
    // a LATER migration recreating one of the dropped policies by name would silently undo the fix
    const dropped = ['Service role can manage tenants', 'System can manage invoices', 'Service role can delete knowledge', 'Service role can insert knowledge', 'Service connections can manage knowledge ingestion runs'];
    for (const f of migrationFiles.filter((m) => Number(m.slice(0, 3)) > 72)) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
      for (const name of dropped) expect(sql.includes(`CREATE POLICY "${name}"`), `${f} recreates "${name}"`).toBe(false);
    }
  });
});
