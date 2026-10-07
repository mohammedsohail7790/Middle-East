/**
 * REAL PostgreSQL proof that the views in `public` are not a way around RLS (migration 074).
 *
 * The bug this guards: integration_status, v_tenant_me_channels and known_feature_flags were owned by `postgres` (which
 * bypasses RLS), ran with the owner's rights, and were granted ALL privileges to anon / authenticated by Supabase's default
 * privileges. An anonymous caller could read every tenant through the first two and, because integration_status is a simple
 * single-table view, UPDATE and DELETE tenant rows through it, while direct access to voice_tenants was correctly denied.
 *
 * Each probe runs as the real API role (a login role that is NOT a superuser and does NOT bypass RLS, a member of anon and
 * authenticated), or as service_role through the seeding connection for the machine-access checks. A failed role switch
 * throws (see loginRoleRunner), and the first test proves the probes really execute as anon.
 *
 * Works against a local PostgreSQL built from schema.sql + migrations and against a hosted Supabase project (needs
 * HALLA_TEST_DATABASE_URL). It only reads and writes inside rolled-back transactions, apart from the synthetic fixture.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import pg from 'pg';
import {
  loginRoleRunner, savepointRunner, seedFixture, cleanupFixture, catalogViolations, grantApiRolesOnBaseTables,
  type Fixture, type Runner, type Row,
} from '../helpers/rls-audit.js';

const DATABASE_URL = process.env.HALLA_TEST_DATABASE_URL;
const run = Boolean(DATABASE_URL);

const TENANT_VIEWS = ['integration_status', 'v_tenant_me_channels'] as const;
const ALL_VIEWS = [...TENANT_VIEWS, 'known_feature_flags'] as const;
const APP_ROLE = `halla_view_app_${randomUUID().slice(0, 8)}`;
const APP_PASSWORD = `view_${randomUUID()}`; // generated per run for a role that exists only for the run

const idsOf = (rows: Row[]) => rows.map((r) => String(r.tenant_id));

/**
 * What a tenant-scoped view MUST NOT allow. [] means: anonymous callers see nothing, tenant A never sees tenant B, and
 * neither can modify tenant B (or anyone's rows) through a view. Used both for the normal state and, with a deliberate
 * re-grant, to prove that security_invoker alone keeps the views tenant-scoped.
 */
async function viewViolations(r: Runner, fx: Fixture): Promise<string[]> {
  const v: string[] = [];
  for (const view of TENANT_VIEWS) {
    const anon = await r(null, `SELECT tenant_id FROM public.${view}`);
    if (!anon.error && anon.rows.length > 0) v.push(`anon CAN READ ${anon.rows.length} row(s) of ${view}`);
    for (const [who, sub] of [['tenant A', fx.userA], ['tenant B', fx.userB]] as const) {
      const other = who === 'tenant A' ? fx.tenantB : fx.tenantA;
      const res = await r(sub, `SELECT tenant_id FROM public.${view}`);
      if (!res.error && idsOf(res.rows).includes(other)) v.push(`${who} CAN SEE the other tenant through ${view}`);
    }
    const stranger = await r(fx.userC, `SELECT tenant_id FROM public.${view}`);
    if (!stranger.error && stranger.rows.length > 0) v.push(`a tenant-less user CAN READ ${stranger.rows.length} row(s) of ${view}`);
  }
  const writes: Array<[string, Parameters<Runner>[0], string, unknown[]]> = [
    ['anon UPDATE', null, `UPDATE public.integration_status SET company_name = 'pwned'`, []],
    ['anon DELETE', null, `DELETE FROM public.integration_status`, []],
    ['tenant A UPDATE of tenant B', fx.userA, `UPDATE public.integration_status SET company_name = 'pwned' WHERE tenant_id = $1`, [fx.tenantB]],
    ['tenant A DELETE of tenant B', fx.userA, `DELETE FROM public.integration_status WHERE tenant_id = $1`, [fx.tenantB]],
    ['tenant A bulk UPDATE', fx.userA, `UPDATE public.integration_status SET company_name = 'pwned' WHERE tenant_id <> $1`, [fx.tenantA]],
  ];
  for (const [label, sub, sql, params] of writes) {
    const w = await r(sub, sql, params);
    if (!w.error && w.rowCount > 0) v.push(`${label} through integration_status SUCCEEDED (${w.rowCount} row(s))`);
  }
  return v;
}

describe.skipIf(!run)('views in public are not a way around RLS (non-superuser, non-BYPASSRLS roles)', () => {
  let su: pg.Client; // seeding, catalog reads, service_role checks and mutation DDL only: never what proves tenant isolation
  let app: pg.Client;
  let fx: Fixture;
  let runner: Runner;
  const q = (sql: string, params: unknown[] = []) => su.query(sql, params as never[]);

  /** One statement as service_role (the machine-access role), in a transaction that is always rolled back. */
  const asServiceRole = async (sql: string, params: unknown[] = []) => {
    await su.query('BEGIN');
    try {
      await su.query('SET LOCAL ROLE service_role');
      try {
        const r = await su.query(sql, params as never[]);
        return { rows: r.rows as Row[], rowCount: r.rowCount ?? 0, error: null as string | null };
      } catch (e) {
        return { rows: [] as Row[], rowCount: 0, error: (e as Error).message };
      }
    } finally {
      await su.query('ROLLBACK');
    }
  };

  beforeAll(async () => {
    su = new pg.Client({ connectionString: DATABASE_URL });
    await su.connect();
    fx = await seedFixture(q, 'viewsec');
    await q(`DROP ROLE IF EXISTS ${APP_ROLE}`);
    await q(`CREATE ROLE ${APP_ROLE} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB PASSWORD '${APP_PASSWORD}' IN ROLE authenticated, anon`);
    await grantApiRolesOnBaseTables(q); // base tables only: `ON ALL TABLES` would also re-grant the views under test
    const url = new URL(DATABASE_URL!);
    url.username = APP_ROLE;
    url.password = APP_PASSWORD;
    app = new pg.Client({ connectionString: url.toString() });
    await app.connect();
    runner = loginRoleRunner(app);
  }, 120_000);

  afterAll(async () => {
    await app?.end().catch(() => {});
    if (fx) await cleanupFixture(q, fx).catch(() => {});
    await q(`DROP OWNED BY ${APP_ROLE}`).catch(() => {});
    await q(`DROP ROLE IF EXISTS ${APP_ROLE}`).catch(() => {});
    await su?.end().catch(() => {});
  });

  it('the probes really run as anon / authenticated with no privileges of their own', async () => {
    const login = await app.query(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = session_user`);
    expect(login.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
    const asAnon = await runner(null, `SELECT current_user AS u, (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user) AS privileged`);
    expect(asAnon.error).toBeNull();
    expect(asAnon.rows[0]).toEqual({ u: 'anon', privileged: false });
    const asA = await runner(fx.userA, `SELECT current_user AS u, auth.uid()::text AS uid`);
    expect(asA.rows[0]).toEqual({ u: 'authenticated', uid: fx.userA });
  });

  it('the two tenant views run with the CALLER\'s rights (security_invoker), the static one reads no table', async () => {
    const rows = (await q(`SELECT c.relname, coalesce(c.reloptions::text, '') AS opts FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'v' AND c.relname = ANY($1::text[]) ORDER BY 1`, [[...ALL_VIEWS]])).rows;
    expect(rows).toEqual([
      { relname: 'integration_status', opts: '{security_invoker=true}' },
      { relname: 'known_feature_flags', opts: '' },
      { relname: 'v_tenant_me_channels', opts: '{security_invoker=true}' },
    ]);
  });

  it('anon is denied outright on every view: no read, no write, no delete (explicit permission error, not an empty result)', async () => {
    for (const view of ALL_VIEWS) {
      const sel = await runner(null, `SELECT * FROM public.${view}`);
      expect(sel.error, `anon SELECT ${view}`).toMatch(/permission denied/i);
    }
    for (const sql of [`UPDATE public.integration_status SET company_name = 'pwned'`, `DELETE FROM public.integration_status`,
      `INSERT INTO public.integration_status (tenant_id, company_name) VALUES ('${randomUUID()}', 'planted')`]) {
      expect((await runner(null, sql)).error, sql).toMatch(/permission denied/i);
    }
    expect((await q(`SELECT count(*)::int AS n FROM public.voice_tenants WHERE id = ANY($1::uuid[]) AND company_name NOT LIKE 'pwned%'`, [[fx.tenantA, fx.tenantB]])).rows[0].n).toBe(2); // untouched
  });

  it('signed-in users (tenant owner A, tenant B, a team member, a tenant-less user) are denied too: tenant A cannot see or modify tenant B through any view', async () => {
    for (const [who, sub] of [['A', fx.userA], ['B', fx.userB], ['admin member', fx.userD], ['agent member', fx.userE], ['tenant-less', fx.userC]] as const) {
      for (const view of ALL_VIEWS) {
        const r = await runner(sub, `SELECT * FROM public.${view}`);
        expect(r.error, `${who} SELECT ${view}`).toMatch(/permission denied/i);
      }
      for (const sql of [`UPDATE public.integration_status SET company_name = 'pwned'`, `DELETE FROM public.integration_status`]) {
        expect((await runner(sub, sql)).error, `${who}: ${sql}`).toMatch(/permission denied/i);
      }
    }
    const intact = (await q(`SELECT count(*)::int AS n FROM public.voice_tenants WHERE id = ANY($1::uuid[]) AND company_name NOT LIKE 'pwned%'`, [[fx.tenantA, fx.tenantB]])).rows[0].n;
    expect(intact).toBe(2);
    expect(await viewViolations(runner, fx)).toEqual([]);
  });

  it('service_role keeps its intended machine access: it can READ the views (every tenant), and nothing else', async () => {
    for (const view of TENANT_VIEWS) {
      const r = await asServiceRole(`SELECT tenant_id FROM public.${view} WHERE tenant_id = ANY($1::uuid[])`, [[fx.tenantA, fx.tenantB]]);
      expect(r.error, `service_role SELECT ${view}`).toBeNull();
      expect(idsOf(r.rows).sort()).toEqual([fx.tenantA, fx.tenantB].sort());
    }
    const flags = await asServiceRole(`SELECT flag_name FROM public.known_feature_flags`);
    expect(flags.error).toBeNull();
    expect(flags.rows.length).toBeGreaterThan(10);
    for (const sql of [`UPDATE public.integration_status SET company_name = 'pwned'`, `DELETE FROM public.integration_status`, `TRUNCATE public.integration_status`]) {
      expect((await asServiceRole(sql)).error, `service_role: ${sql}`).toMatch(/permission denied|cannot|not allowed|is not a table/i);
    }
  });

  it('known_feature_flags exposes no tenant data: two columns, a static list, nothing to join to a tenant', async () => {
    const cols = (await q(`SELECT a.attname FROM pg_attribute a WHERE a.attrelid = 'public.known_feature_flags'::regclass AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`)).rows.map((r) => r.attname);
    expect(cols).toEqual(['flag_name', 'description']);
    const dependsOn = (await q(`SELECT count(*)::int AS n FROM pg_depend d JOIN pg_rewrite r ON r.oid = d.objid WHERE r.ev_class = 'public.known_feature_flags'::regclass AND d.refclassid = 'pg_class'::regclass AND d.refobjid <> 'public.known_feature_flags'::regclass`)).rows[0].n;
    expect(dependsOn).toBe(0);
    const rows = await asServiceRole(`SELECT * FROM public.known_feature_flags`);
    expect(JSON.stringify(rows.rows)).not.toContain(fx.tenantA);
  });

  it('the catalog audit reports no API-role access to any view in public (and nothing else)', async () => {
    expect(await catalogViolations(q)).toEqual([]);
  });

  describe('defense in depth and mutation tests (always rolled back): the suite must FAIL when the defect is restored', () => {
    const inTxn = async <T>(ddl: string[], fn: (r: Runner, sq: (sql: string) => Promise<{ rows: Record<string, unknown>[] }>) => Promise<T>): Promise<T> => {
      const c = new pg.Client({ connectionString: DATABASE_URL });
      await c.connect();
      try {
        await c.query('BEGIN');
        for (const s of ddl) await c.query(s);
        return await fn(savepointRunner(c), (sql) => c.query(sql) as never);
      } finally {
        await c.query('ROLLBACK').catch(() => {});
        await c.end().catch(() => {});
      }
    };
    const REGRANT = TENANT_VIEWS.flatMap((v) => [`GRANT SELECT, UPDATE, DELETE ON public.${v} TO anon, authenticated`]);

    it('even if a later change re-granted the views, security_invoker keeps them tenant-scoped: A sees only A, anon nothing, no cross-tenant write', async () => {
      const { violations, ownA } = await inTxn(REGRANT, async (r, sq) => ({
        violations: await viewViolations(r, fx),
        ownA: await Promise.all(TENANT_VIEWS.map(async (v) => (await r(fx.userA, `SELECT tenant_id FROM public.${v}`)).rows.map((x) => String(x.tenant_id)))),
      }));
      expect(violations).toEqual([]);
      for (const seen of ownA) expect(seen).toEqual([fx.tenantA]); // the owner still gets their own row (RLS applies as the caller)
      // and a team member sees the team's tenant only
      const team = await inTxn(REGRANT, async (r) => (await r(fx.userD, `SELECT tenant_id FROM public.integration_status`)).rows.map((x) => String(x.tenant_id)));
      expect(team).toEqual([fx.tenantA]);
    });

    it('Mutation G: restore the original defect (security_invoker off + client grants) -> anon reads, A sees B, and writes go through; the suite reports it', async () => {
      const { violations, catalog } = await inTxn(
        [`ALTER VIEW public.integration_status SET (security_invoker = false)`, `ALTER VIEW public.v_tenant_me_channels SET (security_invoker = false)`, ...REGRANT],
        async (r, sq) => ({ violations: await viewViolations(r, fx), catalog: await catalogViolations((s) => sq(s)) })
      );
      const text = violations.join('\n');
      expect(text).toMatch(/anon CAN READ \d+ row\(s\) of integration_status/);
      expect(text).toMatch(/anon CAN READ \d+ row\(s\) of v_tenant_me_channels/);
      expect(text).toMatch(/tenant A CAN SEE the other tenant through integration_status/);
      expect(text).toMatch(/anon UPDATE through integration_status SUCCEEDED/);
      expect(text).toMatch(/anon DELETE through integration_status SUCCEEDED/);
      expect(text).toMatch(/tenant A DELETE of tenant B through integration_status SUCCEEDED/);
      expect(catalog.join('\n')).toMatch(/view integration_status is accessible to anon/);
    });

    it('Mutation H: grant SELECT on a view to anon, even with security_invoker still on -> the catalog audit FAILS', async () => {
      const catalog = await inTxn([`GRANT SELECT ON public.known_feature_flags TO anon`, `GRANT SELECT ON public.v_tenant_me_channels TO authenticated`, `GRANT SELECT ON public.integration_status TO PUBLIC`],
        async (_r, sq) => catalogViolations((s) => sq(s)));
      const text = catalog.join('\n');
      expect(text).toMatch(/view known_feature_flags is accessible to anon/);
      expect(text).toMatch(/view v_tenant_me_channels is accessible to authenticated/);
      expect(text).toMatch(/view integration_status is accessible to PUBLIC/);
    });

    it('Mutation I: a NEW view in public (Supabase grants it to the API roles by default) -> the catalog audit FAILS', async () => {
      const catalog = await inTxn([`CREATE VIEW public.zz_audit_probe_view AS SELECT id AS tenant_id, company_name FROM public.voice_tenants`, `GRANT SELECT ON public.zz_audit_probe_view TO anon, authenticated`],
        async (_r, sq) => catalogViolations((s) => sq(s)));
      expect(catalog.join('\n')).toMatch(/view zz_audit_probe_view is accessible to anon/);
    });

    it('the mutations were rolled back: the fixed state is intact afterwards', async () => {
      expect(await catalogViolations(q)).toEqual([]);
      expect(await viewViolations(runner, fx)).toEqual([]);
      expect((await runner(null, `SELECT * FROM public.integration_status`)).error).toMatch(/permission denied/i);
    });
  });
});
