/**
 * REAL PostgreSQL row-level-security proof for Halla's tenant tables, exercised as a database role that is NOT a
 * superuser and does NOT bypass RLS, against the policies produced by the real migrations (001..072).
 *
 * Covered: voice_tenants, team_members, ai_agents, ai_agent_configs (and the secrets and escalation numbers on them),
 * then EVERY table that carries a tenant_id (generic audit), the policy catalog (no open `true` policy, no recursion
 * cycle, RLS on everywhere, pinned SECURITY DEFINER search_path), and two MUTATION tests that re-introduce the original
 * defects and must make the suite's own isolation check fail.
 *
 * Shim, stated plainly: the local database is plain PostgreSQL plus tests/helpers/supabase-shim.sql (Supabase roles,
 * auth.uid() reading the JWT subject claim, auth.users). The shim does not grant table privileges the way Supabase's
 * default privileges do, so this test grants SELECT/INSERT/UPDATE/DELETE on public tables to `authenticated` and `anon`
 * (the worst case: Supabase grants them by default and RLS is the only barrier). The POLICIES are the real ones.
 *
 * Needs HALLA_TEST_DATABASE_URL (a disposable PostgreSQL with schema.sql + migrations 001..072 applied).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import pg from 'pg';
import {
  loginRoleRunner, savepointRunner, seedFixture, cleanupFixture, isolationViolations, catalogViolations,
  seedGenericRow, genericInsert, type Fixture, type Runner,
} from '../helpers/rls-audit.js';

const DATABASE_URL = process.env.HALLA_TEST_DATABASE_URL;
const run = Boolean(DATABASE_URL);

const APP_ROLE = `halla_rls_app_${randomUUID().slice(0, 8)}`;
const APP_PASSWORD = `rls_${randomUUID()}`; // generated per run for a role that exists only for the run

describe.skipIf(!run)('tenant isolation under real RLS (non-superuser, non-BYPASSRLS)', () => {
  let su: pg.Client; // superuser: seeding, catalog reads and mutation DDL only — never used to prove isolation
  let app: pg.Client; // the role isolation is proven with
  let fx: Fixture;
  let runner: Runner;
  const q = (sql: string, params: unknown[] = []) => su.query(sql, params as never[]);
  const generic: Array<{ table: string; seeded: boolean; reason?: string }> = [];
  const genericSeededTenantRows: Array<{ table: string; tenants: string[] }> = [];

  beforeAll(async () => {
    su = new pg.Client({ connectionString: DATABASE_URL });
    await su.connect();
    fx = await seedFixture(q, 'rlsiso');

    await q(`DROP ROLE IF EXISTS ${APP_ROLE}`);
    await q(`CREATE ROLE ${APP_ROLE} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB PASSWORD '${APP_PASSWORD}' IN ROLE authenticated`);
    await q(`GRANT USAGE ON SCHEMA public TO anon, authenticated`);
    await q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated`);
    await q(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated`);

    const url = new URL(DATABASE_URL!);
    url.username = APP_ROLE;
    url.password = APP_PASSWORD;
    app = new pg.Client({ connectionString: url.toString() });
    await app.connect();
    runner = loginRoleRunner(app);
  }, 60_000);

  afterAll(async () => {
    await app?.end().catch(() => {});
    // generic rows were inserted with FK checks off, so remove them the same way
    await q('BEGIN').catch(() => {});
    await q('SET LOCAL session_replication_role = replica').catch(() => {});
    for (const g of genericSeededTenantRows) await q(`DELETE FROM public."${g.table}" WHERE tenant_id = ANY($1::uuid[])`, [g.tenants]).catch(() => {});
    await q('COMMIT').catch(() => {});
    if (fx) await cleanupFixture(q, fx).catch(() => {});
    await q(`DROP OWNED BY ${APP_ROLE}`).catch(() => {});
    await q(`DROP ROLE IF EXISTS ${APP_ROLE}`).catch(() => {});
    await su?.end().catch(() => {});
  });

  it('the test roles really are not superuser and do not bypass RLS (login role, authenticated and anon)', async () => {
    const login = await app.query(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = session_user`);
    expect(login.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
    const roles = await q(`SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname IN ('authenticated','anon') ORDER BY 1`);
    expect(roles.rows).toEqual([
      { rolname: 'anon', rolsuper: false, rolbypassrls: false },
      { rolname: 'authenticated', rolsuper: false, rolbypassrls: false },
    ]);
    const asAuthenticated = await runner(fx.userA, `SELECT current_user AS u, (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user) AS privileged`);
    expect(asAuthenticated.rows[0]).toEqual({ u: 'authenticated', privileged: false });
    expect((await q(`SELECT rolsuper FROM pg_roles WHERE rolname = current_user`)).rows[0].rolsuper).toBe(true); // the seeding connection is a superuser: it is NOT what proves isolation
  });

  describe('the four workforce/tenant tables', () => {
    it('A can access A: owner reads its tenant, team, agents and configuration, and can manage them', async () => {
      const t = await runner(fx.userA, `SELECT id, transfer_phone_number FROM public.voice_tenants`);
      expect(t.error).toBeNull();
      expect(t.rows).toEqual([{ id: fx.tenantA, transfer_phone_number: '+15550001111' }]);
      const team = await runner(fx.userA, `SELECT tenant_id FROM public.team_members`);
      expect(team.error).toBeNull();
      expect(team.rows).toHaveLength(2);
      const agents = await runner(fx.userA, `SELECT name FROM public.ai_agents ORDER BY name`);
      expect(agents.error).toBeNull();
      expect(agents.rows.map((r) => r.name)).toEqual(['A-Coordination', 'A-Qualification', 'A-Receptionist']);
      const cfg = await runner(fx.userA, `SELECT tenant_id, safety_mode, disabled_tools FROM public.ai_agent_configs`);
      expect(cfg.error).toBeNull();
      expect(cfg.rows).toHaveLength(1);
      expect(cfg.rows[0]).toMatchObject({ tenant_id: fx.tenantA, safety_mode: 'standard' });
    });

    it('A cannot read B: not the tenant row, escalation number, agents, configuration, governance or webhook secret', async () => {
      for (const [sql, params] of [
        [`SELECT * FROM public.voice_tenants WHERE id = $1`, [fx.tenantB]],
        [`SELECT transfer_phone_number FROM public.voice_tenants WHERE id = $1`, [fx.tenantB]],
        [`SELECT * FROM public.team_members WHERE tenant_id = $1`, [fx.tenantB]],
        [`SELECT transfer_number, system_prompt FROM public.ai_agents WHERE tenant_id = $1`, [fx.tenantB]],
        [`SELECT safety_mode, disabled_tools, allowed_tools FROM public.ai_agent_configs WHERE tenant_id = $1`, [fx.tenantB]],
        [`SELECT secret FROM public.custom_webhooks WHERE tenant_id = $1`, [fx.tenantB]],
      ] as Array<[string, unknown[]]>) {
        const r = await runner(fx.userA, sql, params);
        expect(r.error, sql).toBeNull();
        expect(r.rows, sql).toHaveLength(0);
      }
    });

    it('B cannot read A (symmetry)', async () => {
      for (const [sql, params] of [
        [`SELECT * FROM public.voice_tenants WHERE id = $1`, [fx.tenantA]],
        [`SELECT * FROM public.team_members WHERE tenant_id = $1`, [fx.tenantA]],
        [`SELECT * FROM public.ai_agents WHERE tenant_id = $1`, [fx.tenantA]],
        [`SELECT * FROM public.ai_agent_configs WHERE tenant_id = $1`, [fx.tenantA]],
        [`SELECT secret FROM public.custom_webhooks WHERE tenant_id = $1`, [fx.tenantA]],
      ] as Array<[string, unknown[]]>) {
        const r = await runner(fx.userB, sql, params);
        expect(r.error, sql).toBeNull();
        expect(r.rows, sql).toHaveLength(0);
      }
    });

    it('A cannot insert into, update or delete B (each is an RLS error or 0 rows) and B is untouched afterwards', async () => {
      const attempts: Array<[string, unknown[]]> = [
        [`UPDATE public.voice_tenants SET company_name='pwned', transfer_phone_number='+19999999999' WHERE id = $1`, [fx.tenantB]],
        [`DELETE FROM public.voice_tenants WHERE id = $1`, [fx.tenantB]],
        [`INSERT INTO public.voice_tenants (owner_user_id, company_name, phone_number) VALUES ($1,'planted','+15557770000')`, [fx.userB]],
        [`INSERT INTO public.team_members (tenant_id, user_id, email, role, status) VALUES ($1,$2,'planted@test.local','admin','active')`, [fx.tenantB, fx.userA]],
        [`UPDATE public.team_members SET role='owner' WHERE tenant_id = $1`, [fx.tenantB]],
        [`INSERT INTO public.ai_agents (tenant_id, name, role, system_prompt) VALUES ($1,'Planted','x','y')`, [fx.tenantB]],
        [`UPDATE public.ai_agents SET system_prompt='pwned', transfer_number='+19999999999' WHERE tenant_id = $1`, [fx.tenantB]],
        [`DELETE FROM public.ai_agents WHERE tenant_id = $1`, [fx.tenantB]],
        [`UPDATE public.ai_agents SET tenant_id = $1 WHERE tenant_id = $2`, [fx.tenantB, fx.tenantA]],
        [`UPDATE public.ai_agent_configs SET safety_mode='off', disabled_tools='[]'::jsonb, ai_governance_enabled=false WHERE tenant_id = $1`, [fx.tenantB]],
        [`DELETE FROM public.ai_agent_configs WHERE tenant_id = $1`, [fx.tenantB]],
      ];
      for (const [sql, params] of attempts) {
        const r = await runner(fx.userA, sql, params);
        expect(r.error !== null || r.rowCount === 0, sql).toBe(true);
      }
      const t = await q(`SELECT company_name, transfer_phone_number FROM public.voice_tenants WHERE id = $1`, [fx.tenantB]);
      expect(t.rows[0]).toEqual({ company_name: 'rlsiso B', transfer_phone_number: '+15550002222' });
      expect((await q(`SELECT count(*)::int AS n FROM public.ai_agents WHERE tenant_id = $1 AND system_prompt NOT LIKE 'pwned%' AND name <> 'Planted'`, [fx.tenantB])).rows[0].n).toBe(3);
      const cfg = await q(`SELECT safety_mode, ai_governance_enabled, disabled_tools FROM public.ai_agent_configs WHERE tenant_id = $1`, [fx.tenantB]);
      expect(cfg.rows[0]).toMatchObject({ safety_mode: 'standard', ai_governance_enabled: true });
      expect(cfg.rows[0].disabled_tools).toContain('send_sms');
      expect((await q(`SELECT count(*)::int AS n FROM public.ai_agents WHERE tenant_id = $1`, [fx.tenantA])).rows[0].n).toBe(3); // A's own agents were not re-homed
    });

    it('anonymous/public and a tenant-less user obtain nothing and cannot plant a tenant', async () => {
      for (const sub of [null, fx.userC]) {
        for (const table of ['voice_tenants', 'team_members', 'ai_agents', 'ai_agent_configs', 'custom_webhooks']) {
          const r = await runner(sub, `SELECT * FROM public.${table}`);
          expect(r.rows, `${table} as ${sub ?? 'anon'}`).toHaveLength(0);
        }
      }
      const planted = await runner(null, `INSERT INTO public.voice_tenants (owner_user_id, company_name, phone_number) VALUES ($1,'planted','+15557771111')`, [fx.userC]);
      expect(planted.error !== null || planted.rowCount === 0).toBe(true);
    });

    it('within a tenant: members can read the team and their tenant, but only the OWNER manages the team', async () => {
      for (const sub of [fx.userD, fx.userE]) {
        const team = await runner(sub, `SELECT tenant_id FROM public.team_members`);
        expect(team.error).toBeNull();
        expect(team.rows.length).toBe(2);
        const t = await runner(sub, `SELECT id FROM public.voice_tenants`);
        expect(t.rows.map((r) => r.id)).toEqual([fx.tenantA]);
        for (const [sql, params] of [
          [`INSERT INTO public.team_members (tenant_id, user_id, email, role, status) VALUES ($1,$2,'x@test.local','admin','active')`, [fx.tenantA, fx.userC]],
          [`UPDATE public.team_members SET role='owner' WHERE tenant_id = $1`, [fx.tenantA]],
          [`DELETE FROM public.team_members WHERE tenant_id = $1`, [fx.tenantA]],
        ] as Array<[string, unknown[]]>) {
          const w = await runner(sub, sql, params);
          expect(w.error !== null || w.rowCount === 0, sql).toBe(true);
        }
      }
      const ownerManages = await runner(fx.userA, `UPDATE public.team_members SET full_name = 'x' WHERE tenant_id = $1`, [fx.tenantA]);
      expect(ownerManages.error).toBeNull();
      expect(ownerManages.rowCount).toBe(2);
    });

    it('isolationViolations() — the single definition of "isolation holds" — returns nothing', async () => {
      expect(await isolationViolations(runner, fx)).toEqual([]);
    });
  });

  describe('the policy catalog', () => {
    it('no open `true` policy for anon/authenticated/public, RLS on every tenant table, no policy recursion, definers pinned', async () => {
      expect(await catalogViolations(q)).toEqual([]);
    });

    it('the vulnerable PUBLIC `Service role can manage tenants` policy no longer exists', async () => {
      const r = await q(`SELECT 1 FROM pg_policies WHERE tablename = 'voice_tenants' AND policyname = 'Service role can manage tenants'`);
      expect(r.rows).toHaveLength(0);
    });
  });

  describe('every table that carries a tenant_id (generic audit)', () => {
    it('is readable by a tenant owner without error, never shows the other tenant, and refuses cross-tenant writes', async () => {
      const tables = (await q(`
        SELECT DISTINCT c.table_name FROM information_schema.columns c JOIN pg_tables t ON t.tablename = c.table_name AND t.schemaname = 'public'
         WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id' ORDER BY 1`)).rows.map((r) => String(r.table_name));
      expect(tables.length).toBeGreaterThan(60);

      const failures: string[] = [];
      // These four already hold the fixture's rows (and are proven by the explicit tests above); seeding more rows into them
      // would change the counts those tests rely on, so the generic audit only probes them.
      const FIXTURE_TABLES = new Set(['team_members', 'ai_agents', 'ai_agent_configs', 'custom_webhooks']);
      for (const table of tables) {
        // 1. seed one synthetic row per tenant (superuser, FK checks off); a table that cannot be seeded is still probed for recursion/errors
        const fixtureTable = FIXTURE_TABLES.has(table);
        let a: Awaited<ReturnType<typeof seedGenericRow>> = { ok: false, reason: 'fixture table' };
        let b = a;
        if (fixtureTable) {
          generic.push({ table, seeded: true });
        } else {
          await q('BEGIN');
          a = await seedGenericRow(su, table, fx.tenantA);
          b = a.ok ? await seedGenericRow(su, table, fx.tenantB) : a;
          await q('COMMIT');
          generic.push({ table, seeded: a.ok && b.ok, reason: a.ok && b.ok ? undefined : ('reason' in a ? a.reason : 'reason' in b ? b.reason : undefined) });
          if (a.ok && b.ok) genericSeededTenantRows.push({ table, tenants: [fx.tenantA, fx.tenantB] });
        }

        // 2. as tenant A: the table can be read at all (no recursion / permission error)
        const all = await runner(fx.userA, `SELECT count(*)::int AS n FROM public."${table}"`);
        if (all.error) { failures.push(`${table}: read as owner failed: ${all.error}`); continue; }
        // 3. ...and the other tenant's rows are invisible, to the owner, to a tenant-less user and to anon
        for (const [who, sub] of [['A', fx.userA], ['tenant-less', fx.userC], ['anon', null]] as const) {
          const other = await runner(sub, `SELECT count(*)::int AS n FROM public."${table}" WHERE tenant_id = $1`, [fx.tenantB]);
          if (who === 'A' && other.rows[0]?.n > 0) failures.push(`${table}: A can read B's rows`);
          if (who !== 'A') {
            const own = await runner(sub, `SELECT count(*)::int AS n FROM public."${table}" WHERE tenant_id = ANY($1::uuid[])`, [[fx.tenantA, fx.tenantB]]);
            if (own.rows[0]?.n > 0) failures.push(`${table}: ${who} can read tenant rows`);
          }
        }
        // 4. cross-tenant writes
        for (const [label, sql] of [
          ['UPDATE', `UPDATE public."${table}" SET tenant_id = tenant_id WHERE tenant_id = $1`],
          ['DELETE', `DELETE FROM public."${table}" WHERE tenant_id = $1`],
        ] as const) {
          const w = await runner(fx.userA, sql, [fx.tenantB]);
          if (!w.error && w.rowCount > 0) failures.push(`${table}: A ${label}d B's row(s)`);
        }
        if (a.ok && b.ok) {
          const ins = genericInsert(table, a.cols, a.values.map((v, i) => (a.cols[i].dataType === 'uuid' && a.cols[i].name !== 'tenant_id' ? randomUUID() : typeof v === 'string' && v.startsWith('x-') ? `x-${randomUUID().slice(0, 12)}` : v)), fx.tenantB);
          const w = await runner(fx.userA, ins.sql, ins.params);
          if (!w.error && w.rowCount > 0) failures.push(`${table}: A INSERTED a row for B`);
          const anonW = await runner(null, ins.sql, ins.params);
          if (!anonW.error && anonW.rowCount > 0) failures.push(`${table}: anon INSERTED a tenant row`);
        }
      }
      // remove the synthetic rows now so later tests see only the fixture
      await q('BEGIN');
      await q('SET LOCAL session_replication_role = replica');
      for (const g of genericSeededTenantRows) await q(`DELETE FROM public."${g.table}" WHERE tenant_id = ANY($1::uuid[])`, [g.tenants]);
      await q('COMMIT');
      genericSeededTenantRows.length = 0;
      const seeded = generic.filter((g) => g.seeded).length;
      // eslint-disable-next-line no-console
      console.log(`RLS_GENERIC_AUDIT tables=${tables.length} seeded=${seeded} unseeded=${tables.length - seeded} failures=${failures.length}`);
      // eslint-disable-next-line no-console
      console.log(`RLS_GENERIC_UNSEEDED ${generic.filter((g) => !g.seeded).map((g) => `${g.table}(${g.reason})`).join('; ')}`);
      expect(failures).toEqual([]);
      // Every tenant table must be behaviourally exercised. A table that cannot be seeded is NOT proof of isolation, so it
      // fails here (a new table with an exotic constraint must teach the seeder, not slip through unchecked).
      expect(generic.filter((g) => !g.seeded).map((g) => `${g.table}: ${g.reason}`), 'tables that could not be seeded').toEqual([]);
      expect(seeded).toBe(tables.length);
      expect(tables.length).toBeGreaterThan(70); // and the audit really did find the tenant tables
    }, 600_000);
  });

  /**
   * MUTATION TESTS. Each re-introduces a known defect INSIDE a transaction that is always rolled back, then runs the very
   * same isolation check. The check MUST report violations; if it did not, the suite would not catch the regression.
   */
  describe('mutation tests: the suite must FAIL when a known defect is restored', () => {
    const withMutation = async <T>(ddl: string[], fn: (r: Runner, sq: (sql: string) => Promise<{ rows: Record<string, unknown>[] }>) => Promise<T>): Promise<T> => {
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

    it('Mutation A: restore the PUBLIC `USING (true)` policy on voice_tenants -> isolation check and catalog audit FAIL', async () => {
      const { violations, catalog } = await withMutation(
        [`CREATE POLICY "Service role can manage tenants" ON public.voice_tenants FOR ALL USING (true)`],
        async (r, sq) => ({ violations: await isolationViolations(r, fx), catalog: await catalogViolations((s) => sq(s)) })
      );
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.join('\n')).toMatch(/voice_tenants.*CAN READ the other tenant|CAN READ .*transfer_phone_number|voice_tenants UPDATE .*SUCCEEDED|voice_tenants INSERT/);
      expect(catalog.join('\n')).toMatch(/open "true" policy .*voice_tenants/);
    });

    it('Mutation B: restore the recursive voice_tenants <-> team_members policies -> isolation check and catalog audit FAIL', async () => {
      const { violations, catalog } = await withMutation(
        [
          `CREATE POLICY "Users can view their own tenant" ON public.voice_tenants FOR SELECT
             USING (owner_user_id = auth.uid() OR id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()))`,
          `CREATE POLICY "Users can view their tenant's team members" ON public.team_members FOR SELECT
             USING (tenant_id IN (SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid()))`,
        ],
        async (r, sq) => ({ violations: await isolationViolations(r, fx), catalog: await catalogViolations((s) => sq(s)) })
      );
      expect(violations.join('\n')).toMatch(/infinite recursion detected in policy/);
      expect(catalog.join('\n')).toMatch(/policy dependency cycle \(recursion\): .*(voice_tenants|team_members)/);
    });

    it('Mutation C: switch RLS off on a tenant table, or restore a PUBLIC `true` INSERT policy -> catalog audit FAILS', async () => {
      const catalog = await withMutation(
        [`ALTER TABLE public.call_spam_log DISABLE ROW LEVEL SECURITY`, `CREATE POLICY "System can insert audit logs" ON public.audit_logs FOR INSERT WITH CHECK (true)`],
        async (_r, sq) => catalogViolations((s) => sq(s))
      );
      expect(catalog.join('\n')).toMatch(/tenant table WITHOUT RLS: call_spam_log/);
      expect(catalog.join('\n')).toMatch(/open "true" policy .*audit_logs/);
    });

    it('the mutations were rolled back: the fixed state is intact afterwards', async () => {
      expect(await isolationViolations(runner, fx)).toEqual([]);
      expect(await catalogViolations(q)).toEqual([]);
    });
  });
});
