/**
 * Row-level-security audit helpers for the real-PostgreSQL tenant-isolation suites.
 *
 * Nothing here mocks the database. Probes run as the Supabase `authenticated` role (NOSUPERUSER, NOBYPASSRLS) with the
 * JWT subject claim that `auth.uid()` reads, against the policies produced by the real migrations.
 *
 * `isolationViolations()` is the single definition of "tenant isolation holds" for the four workforce/tenant tables.
 * The normal tests assert it returns []; the mutation tests re-introduce a known defect and assert it returns something.
 */
import { randomUUID } from 'crypto';
import pg from 'pg';

export type Row = Record<string, unknown>;
export interface Probe { rows: Row[]; rowCount: number; error: string | null }
export type Runner = (sub: string | null, sql: string, params?: unknown[]) => Promise<Probe>;

/** A runner on a LOGIN role that is not a superuser and does not bypass RLS; each probe is its own rolled-back transaction. */
export function loginRoleRunner(app: pg.Client): Runner {
  return async (sub, sql, params = []) => {
    await app.query('BEGIN');
    try {
      // Becoming anon / authenticated MUST succeed. If it were refused and reported as an ordinary probe error, every
      // "denied" or "empty" result below (anonymous access, tenant-less access, cross-tenant reads) would pass without the
      // probe ever having run as that role. A failed role switch therefore throws and fails the test.
      await app.query(sub === null ? 'SET LOCAL ROLE anon' : 'SET LOCAL ROLE authenticated');
      await app.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [sub ?? '']);
      try {
        const r = await app.query(sql, params as never[]);
        return { rows: r.rows as Row[], rowCount: r.rowCount ?? 0, error: null };
      } catch (e) {
        return { rows: [], rowCount: 0, error: (e as Error).message };
      }
    } finally {
      await app.query('ROLLBACK');
    }
  };
}

/**
 * A runner for use INSIDE an already-open superuser transaction (mutation tests: DDL and probes share one transaction, so
 * a re-introduced defect is visible to the probe and then rolled back). Each probe switches to `authenticated` for its
 * duration, so RLS applies exactly as for a real client.
 */
export function savepointRunner(su: pg.Client): Runner {
  return async (sub, sql, params = []) => {
    await su.query('SAVEPOINT rls_probe');
    try {
      // as in loginRoleRunner: a failed role switch must fail loudly, never look like "access denied"
      await su.query(sub === null ? 'SET LOCAL ROLE anon' : 'SET LOCAL ROLE authenticated');
      await su.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [sub ?? '']);
      try {
        const r = await su.query(sql, params as never[]);
        return { rows: r.rows as Row[], rowCount: r.rowCount ?? 0, error: null };
      } catch (e) {
        return { rows: [], rowCount: 0, error: (e as Error).message };
      }
    } finally {
      await su.query('RESET ROLE').catch(() => {});
      await su.query('ROLLBACK TO SAVEPOINT rls_probe');
      await su.query('RELEASE SAVEPOINT rls_probe');
    }
  };
}

export interface Fixture {
  userA: string; userB: string; userC: string; userD: string; userE: string;
  tenantA: string; tenantB: string;
}

type Q = (sql: string, params?: unknown[]) => Promise<{ rows: Row[] }>;

/**
 * Two tenants with distinct owners, a team for tenant A (D = admin, E = agent), a user with no tenant (C), three agents,
 * a configuration row with governance columns, an escalation number, a webhook secret and an API-key hash per tenant.
 */
export async function seedFixture(q: Q, label = 'rls'): Promise<Fixture> {
  // Explicit ids: Supabase's real auth.users.id has no default (only the local shim does), so a fixture that relies on one
  // cannot run against a hosted project.
  const user = async (n: string) => (await q(`INSERT INTO auth.users (id, email) VALUES ($1, $2) RETURNING id`, [randomUUID(), `${label}-${n}-${randomUUID()}@test.local`])).rows[0].id as string;
  const [userA, userB, userC, userD, userE] = [await user('a'), await user('b'), await user('c'), await user('d'), await user('e')];
  const tenant = async (owner: string, name: string, transfer: string) =>
    (await q(`INSERT INTO public.voice_tenants (owner_user_id, company_name, phone_number, transfer_phone_number) VALUES ($1,$2,$3,$4) RETURNING id`, [owner, `${label} ${name}`, `+1555${Math.floor(Math.random() * 1e7)}`, transfer])).rows[0].id as string;
  const tenantA = await tenant(userA, 'A', '+15550001111');
  const tenantB = await tenant(userB, 'B', '+15550002222');

  await q(`INSERT INTO public.team_members (tenant_id, user_id, email, role, status) VALUES ($1,$2,$3,'admin','active'), ($1,$4,$5,'agent','active')`,
    [tenantA, userD, `d-${randomUUID()}@test.local`, userE, `e-${randomUUID()}@test.local`]);

  for (const [t, names] of [[tenantA, ['A-Receptionist', 'A-Qualification', 'A-Coordination']], [tenantB, ['B-Sales', 'B-Support', 'B-Fulfilment']]] as const) {
    for (const name of names) {
      await q(`INSERT INTO public.ai_agents (tenant_id, name, role, system_prompt, transfer_number) VALUES ($1,$2,'r','prompt for ' || $2, $3)`, [t, name, t === tenantA ? '+15550001111' : '+15550002222']);
    }
    await q(`INSERT INTO public.ai_agent_configs (tenant_id, system_instructions, safety_mode, disabled_tools, ai_governance_enabled) VALUES ($1,$2,'standard','["send_sms"]'::jsonb,true)`, [t, `instructions of ${t === tenantA ? 'A' : 'B'}`]);
    await q(`INSERT INTO public.custom_webhooks (tenant_id, name, url, events, secret) VALUES ($1,'hook','https://example.test/h',ARRAY['lead.created'], $2)`, [t, `whsec-${t === tenantA ? 'A' : 'B'}-${randomUUID()}`]);
  }
  return { userA, userB, userC, userD, userE, tenantA, tenantB };
}

/**
 * Gives anon and authenticated table privileges the way Supabase does (RLS is then the only barrier), on BASE TABLES ONLY.
 * Do not use `GRANT ... ON ALL TABLES IN SCHEMA public`: in PostgreSQL that also covers VIEWS, so every test run would
 * silently re-grant access on integration_status / v_tenant_me_channels / known_feature_flags and undo migration 074 on the
 * very database under test.
 */
export async function grantApiRolesOnBaseTables(q: Q): Promise<void> {
  // One statement, one transaction, under an advisory lock: test files run in parallel against the same database and
  // concurrent GRANTs on the same objects fail with "tuple concurrently updated".
  await q(`
    DO $$
    DECLARE t record;
    BEGIN
      PERFORM pg_advisory_xact_lock(hashtext('halla_rls_grant_api_roles'));
      EXECUTE 'GRANT USAGE ON SCHEMA public TO anon, authenticated';
      FOR t IN SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') LOOP
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated', t.relname);
      END LOOP;
      EXECUTE 'GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated';
    END $$`);
}

export async function cleanupFixture(q: Q, fx: Fixture): Promise<void> {
  await q(`DELETE FROM public.voice_tenants WHERE id = ANY($1::uuid[])`, [[fx.tenantA, fx.tenantB]]);
  await q(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])`, [[fx.userA, fx.userB, fx.userC, fx.userD, fx.userE]]);
}

const ids = (rows: Row[], key: string) => rows.map((r) => String(r[key]));

/**
 * The definition of "tenant isolation holds" for voice_tenants, team_members, ai_agents and ai_agent_configs (plus the
 * secrets and escalation numbers that live on them). Returns every violation found; [] means isolation holds AND
 * legitimate access works. An ERROR on a legitimate read (for example "infinite recursion detected in policy") is a violation.
 */
export async function isolationViolations(run: Runner, fx: Fixture): Promise<string[]> {
  const v: string[] = [];
  const { tenantA, tenantB, userA, userB, userC, userD, userE } = fx;

  const readOwn = async (who: string, sub: string | null, sql: string, own: string, other: string, key = 'tenant_id', requireOwn = true) => {
    const r = await run(sub, sql);
    if (r.error) { v.push(`${who}: read failed (${r.error})`); return r; }
    const seen = ids(r.rows, key);
    if (seen.includes(other)) v.push(`${who}: CAN READ the other tenant's rows`);
    if (requireOwn && !seen.includes(own)) v.push(`${who}: cannot read its OWN rows`);
    return r;
  };

  // --- tenant A reads (and symmetrically tenant B)
  for (const [who, sub, own, other] of [['A', userA, tenantA, tenantB], ['B', userB, tenantB, tenantA]] as const) {
    await readOwn(`${who}/voice_tenants`, sub, `SELECT id, transfer_phone_number, company_name FROM public.voice_tenants`, own, other, 'id');
    await readOwn(`${who}/team_members`, sub, `SELECT tenant_id FROM public.team_members`, own, other, 'tenant_id', who === 'A'); // only tenant A has a team in the fixture
    await readOwn(`${who}/ai_agents`, sub, `SELECT tenant_id, transfer_number FROM public.ai_agents`, own, other);
    await readOwn(`${who}/ai_agent_configs`, sub, `SELECT tenant_id, safety_mode, disabled_tools FROM public.ai_agent_configs`, own, other);
    // secrets and escalation numbers of the OTHER tenant
    for (const [table, col] of [['custom_webhooks', 'secret'], ['voice_tenants', 'transfer_phone_number'], ['ai_agents', 'transfer_number']] as const) {
      const idCol = table === 'voice_tenants' ? 'id' : 'tenant_id';
      const r = await run(sub, `SELECT ${col} FROM public.${table} WHERE ${idCol} = $1`, [other]);
      if (!r.error && r.rows.length > 0) v.push(`${who}: CAN READ ${table}.${col} of the other tenant`);
    }
  }
  // team_members of A exist for A (D, E are in it); B must not see them
  const teamA = await run(userA, `SELECT user_id FROM public.team_members WHERE tenant_id = $1`, [tenantA]);
  if (!teamA.error && teamA.rows.length !== 2) v.push(`A/team_members: expected the 2 teammates, saw ${teamA.rows.length}`);

  // --- tenant A writes against tenant B (each must error or affect 0 rows)
  const writes: Array<[string, string, unknown[]]> = [
    ['voice_tenants UPDATE', `UPDATE public.voice_tenants SET company_name = 'pwned', transfer_phone_number = '+19999999999' WHERE id = $1`, [tenantB]],
    ['voice_tenants DELETE', `DELETE FROM public.voice_tenants WHERE id = $1`, [tenantB]],
    ['voice_tenants INSERT (owner = B)', `INSERT INTO public.voice_tenants (owner_user_id, company_name, phone_number) VALUES ($1,'planted','+15557770000')`, [userB]],
    ['team_members INSERT', `INSERT INTO public.team_members (tenant_id, user_id, email, role, status) VALUES ($1,$2,'planted@test.local','admin','active')`, [tenantB, userA]],
    ['team_members UPDATE', `UPDATE public.team_members SET role = 'owner' WHERE tenant_id = $1`, [tenantB]],
    ['team_members DELETE', `DELETE FROM public.team_members WHERE tenant_id = $1`, [tenantB]],
    ['ai_agents UPDATE', `UPDATE public.ai_agents SET system_prompt = 'pwned', transfer_number = '+19999999999' WHERE tenant_id = $1`, [tenantB]],
    ['ai_agents DELETE', `DELETE FROM public.ai_agents WHERE tenant_id = $1`, [tenantB]],
    ['ai_agents INSERT', `INSERT INTO public.ai_agents (tenant_id, name, role, system_prompt) VALUES ($1,'Planted','x','y')`, [tenantB]],
    ['ai_agents re-home', `UPDATE public.ai_agents SET tenant_id = $1 WHERE tenant_id = $2`, [tenantB, tenantA]],
    ['ai_agent_configs UPDATE (weaken governance)', `UPDATE public.ai_agent_configs SET safety_mode = 'off', disabled_tools = '[]'::jsonb, ai_governance_enabled = false WHERE tenant_id = $1`, [tenantB]],
    ['ai_agent_configs DELETE', `DELETE FROM public.ai_agent_configs WHERE tenant_id = $1`, [tenantB]],
    ['ai_agent_configs INSERT', `INSERT INTO public.ai_agent_configs (tenant_id) VALUES ($1)`, [randomUUID()]],
  ];
  // the last INSERT targets a tenant that does not exist: it must fail (RLS and/or FK), never succeed for a stranger
  for (const [label, sql, params] of writes) {
    const r = await run(userA, sql, params);
    if (!r.error && r.rowCount > 0) v.push(`A: ${label} against another tenant SUCCEEDED (${r.rowCount} row(s))`);
  }

  // --- anonymous / public and a tenant-less user
  for (const [who, sub] of [['anon', null], ['tenant-less user', userC]] as const) {
    for (const table of ['voice_tenants', 'team_members', 'ai_agents', 'ai_agent_configs']) {
      const r = await run(sub, `SELECT * FROM public.${table}`);
      if (r.rows.length > 0) v.push(`${who}: CAN READ ${r.rows.length} row(s) of ${table}`);
    }
    const w = await run(sub, `INSERT INTO public.voice_tenants (owner_user_id, company_name, phone_number) VALUES ($1,'planted','+15557771111')`, [userC]);
    if (who === 'anon' && !w.error && w.rowCount > 0) v.push(`anon: INSERT into voice_tenants SUCCEEDED`);
  }

  // --- within a tenant: members read, only the owner manages the team
  for (const [who, sub] of [['admin member', userD], ['agent member', userE]] as const) {
    const r = await run(sub, `SELECT tenant_id FROM public.team_members`);
    if (r.error || !ids(r.rows, 'tenant_id').includes(tenantA)) v.push(`${who}: cannot read its own team (${r.error ?? 'empty'})`);
    for (const [label, sql, params] of [
      ['team_members INSERT', `INSERT INTO public.team_members (tenant_id, user_id, email, role, status) VALUES ($1,$2,'x@test.local','admin','active')`, [tenantA, userC]],
      ['team_members UPDATE', `UPDATE public.team_members SET role = 'owner' WHERE tenant_id = $1`, [tenantA]],
      ['team_members DELETE', `DELETE FROM public.team_members WHERE tenant_id = $1`, [tenantA]],
    ] as Array<[string, string, unknown[]]>) {
      const w = await run(sub, sql, params);
      if (!w.error && w.rowCount > 0) v.push(`${who}: ${label} SUCCEEDED (only the owner may manage the team)`);
    }
    const t = await run(sub, `SELECT id FROM public.voice_tenants`);
    if (t.error || !ids(t.rows, 'id').includes(tenantA)) v.push(`${who}: cannot read its tenant (${t.error ?? 'empty'})`);
  }
  // legitimate owner paths must work
  const own = await run(userA, `UPDATE public.voice_tenants SET company_name = company_name WHERE id = $1`, [tenantA]);
  if (own.error || own.rowCount !== 1) v.push(`A: owner cannot update its own tenant (${own.error ?? own.rowCount})`);
  const ownAgent = await run(userA, `UPDATE public.ai_agents SET active = active WHERE tenant_id = $1`, [tenantA]);
  if (ownAgent.error || ownAgent.rowCount !== 3) v.push(`A: owner cannot manage its own agents (${ownAgent.error ?? ownAgent.rowCount})`);
  const ownCfg = await run(userA, `UPDATE public.ai_agent_configs SET tone = tone WHERE tenant_id = $1`, [tenantA]);
  if (ownCfg.error || ownCfg.rowCount !== 1) v.push(`A: owner cannot manage its own configuration (${ownCfg.error ?? ownCfg.rowCount})`);
  return v;
}

// ------------------------------------------------------------------------------------------ catalog audit

/** Policies deliberately open to every role because the table is a tenant-free catalog. */
export const ALLOWED_OPEN_POLICIES = new Set(['integrations.integrations_read_all']);

export async function catalogViolations(q: Q): Promise<string[]> {
  const v: string[] = [];

  const noRls = await q(`
    SELECT DISTINCT c.table_name FROM information_schema.columns c
      JOIN pg_class k ON k.relname = c.table_name
      JOIN pg_namespace n ON n.oid = k.relnamespace AND n.nspname = 'public'
     WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id' AND k.relkind = 'r' AND NOT k.relrowsecurity ORDER BY 1`);
  for (const r of noRls.rows) v.push(`tenant table WITHOUT RLS: ${r.table_name}`);

  const open = await q(`
    SELECT tablename, policyname, roles::text AS roles FROM pg_policies
     WHERE schemaname = 'public' AND (qual = 'true' OR with_check = 'true')`);
  for (const r of open.rows) {
    const onlyService = String(r.roles).replace(/[{}]/g, '').split(',').every((x) => x.trim() === 'service_role');
    if (!onlyService && !ALLOWED_OPEN_POLICIES.has(`${r.tablename}.${r.policyname}`)) v.push(`open "true" policy for ${r.roles}: ${r.tablename}."${r.policyname}"`);
  }

  // policy dependency graph: a policy on X that mentions table Y makes X depend on Y; any cycle (or self-reference) recurses
  const tables = (await q(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`)).rows.map((r) => String(r.tablename));
  const pol = (await q(`SELECT tablename, cmd, coalesce(qual,'') || ' ' || coalesce(with_check,'') AS expr FROM pg_policies WHERE schemaname = 'public'`)).rows;
  const edges = new Map<string, Set<string>>();
  for (const p of pol) {
    for (const t of tables) {
      // a table is DEPENDED ON only when a policy reads it (FROM / JOIN); `knowledge_base.tenant_id` is just a column qualifier
      if (new RegExp(`\\b(?:from|join)\\s+(?:public\\.)?"?${t}\\b`, 'i').test(String(p.expr))) {
        // A write policy that reads its OWN table goes through that table's SELECT policy, which is fine (org_members_insert_admin).
        // Only a SELECT/ALL policy reading its own table re-enters itself; and any A -> B -> A cycle recurses.
        if (t === String(p.tablename) && !['SELECT', 'ALL'].includes(String(p.cmd))) continue;
        if (!edges.has(String(p.tablename))) edges.set(String(p.tablename), new Set());
        edges.get(String(p.tablename))!.add(t);
      }
    }
  }
  const state = new Map<string, number>();
  const stack: string[] = [];
  const cycles = new Set<string>();
  const dfs = (n: string) => {
    state.set(n, 1); stack.push(n);
    for (const m of edges.get(n) ?? []) {
      if (state.get(m) === 1) cycles.add([...stack.slice(stack.indexOf(m)), m].join(' -> '));
      else if (!state.has(m)) dfs(m);
    }
    stack.pop(); state.set(n, 2);
  };
  for (const n of edges.keys()) if (!state.has(n)) dfs(n);
  for (const c of cycles) v.push(`policy dependency cycle (recursion): ${c}`);

  const definers = await q(`SELECT proname, proconfig::text AS cfg FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND prosecdef`);
  for (const r of definers.rows) if (!String(r.cfg ?? '').includes('search_path')) v.push(`SECURITY DEFINER function without a pinned search_path: ${r.proname}`);

  // The three RLS helpers: all must exist, must be callable by exactly the roles the policies run as (authenticated,
  // service_role), and by neither anon nor PUBLIC. On Supabase, default privileges grant EXECUTE on new functions to anon
  // directly, so `REVOKE ... FROM PUBLIC` alone is not enough; both are checked separately.
  const helpers = ['user_can_access_tenant', 'user_is_tenant_owner', 'user_is_tenant_admin'];
  const exec = await q(`
    SELECT p.proname,
           has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
           has_function_privilege('public', p.oid, 'EXECUTE') AS pub,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
           has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role
      FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN ('user_can_access_tenant', 'user_is_tenant_owner', 'user_is_tenant_admin')`);
  for (const name of helpers) if (!exec.rows.some((r) => r.proname === name)) v.push(`RLS helper ${name} is missing`);
  for (const r of exec.rows) {
    if (r.anon) v.push(`RLS helper ${r.proname} is executable by anon`);
    if (r.pub) v.push(`RLS helper ${r.proname} is executable by PUBLIC`);
    if (!r.authenticated) v.push(`RLS helper ${r.proname} is NOT executable by authenticated (policies would fail)`);
    if (!r.service_role) v.push(`RLS helper ${r.proname} is NOT executable by service_role`);
  }

  // Views and materialized views in `public`. A view owned by `postgres` runs with the owner's rights and bypasses RLS
  // (unless security_invoker is on), and Supabase grants every new object in `public` to anon / authenticated by default.
  // That is how integration_status and v_tenant_me_channels let an anonymous caller read, update and delete every tenant.
  // None of the project's views is meant to be client-readable, so ANY API-role access to a public view is a violation;
  // a view that must be exposed has to be added to an allow-list here on purpose.
  const views = await q(`
    SELECT c.relname,
           has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS anon,
           has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS authenticated,
           has_table_privilege('public', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS pub
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm') ORDER BY c.relname`);
  for (const r of views.rows) {
    if (r.anon) v.push(`view ${r.relname} is accessible to anon`);
    if (r.authenticated) v.push(`view ${r.relname} is accessible to authenticated`);
    if (r.pub) v.push(`view ${r.relname} is accessible to PUBLIC`);
  }
  return v;
}

// ------------------------------------------------------------------------------------------ generic table audit

interface ColumnInfo { name: string; type: string; dataType: string; udt: string }

type Valued = { ok: true; value: unknown } | { ok: false; reason: string };

/** A synthetic value that satisfies the column's TYPE. CHECK constraints are handled separately (see valueFromCheck). */
async function valueFor(su: pg.Client, c: ColumnInfo, tenantId: string): Promise<Valued> {
  if (c.name === 'tenant_id') return { ok: true, value: tenantId };
  const t = c.dataType.toLowerCase();
  if (t === 'uuid') return { ok: true, value: randomUUID() };
  if (['text', 'character varying', 'character'].includes(t)) return { ok: true, value: `x-${randomUUID().slice(0, 12)}` };
  if (['integer', 'bigint', 'smallint', 'numeric', 'real', 'double precision'].includes(t)) return { ok: true, value: '1' };
  if (t === 'boolean') return { ok: true, value: 'true' };
  if (t === 'jsonb' || t === 'json') return { ok: true, value: '{}' };
  if (t.startsWith('timestamp')) return { ok: true, value: new Date().toISOString() };
  if (t === 'date') return { ok: true, value: new Date().toISOString().slice(0, 10) };
  if (t.startsWith('time')) return { ok: true, value: '00:00:00' };
  if (t === 'array') return { ok: true, value: '{}' };
  if (t === 'inet') return { ok: true, value: '127.0.0.1' };
  if (t === 'bytea') return { ok: true, value: '\\x00' };
  if (t === 'user-defined') {
    if (c.udt === 'vector') {
      const dims = Number(c.type.match(/\((\d+)\)/)?.[1] ?? 0);
      if (!dims) return { ok: false, reason: 'vector without a fixed dimension' };
      return { ok: true, value: `[${new Array(dims).fill(0).join(',')}]` };
    }
    const e = await su.query(`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = $1 ORDER BY e.enumsortorder LIMIT 1`, [c.udt]);
    if (e.rows.length === 0) return { ok: false, reason: `unsupported user-defined type ${c.udt}` };
    return { ok: true, value: e.rows[0].enumlabel };
  }
  return { ok: false, reason: `unsupported type ${c.dataType}` };
}

/**
 * Learns an allowed value from a violated CHECK constraint, but ONLY for the simple, unambiguous shape
 * `column = ANY (ARRAY['a', 'b', ...])` / `column = 'a'` on exactly one of our columns. Anything with a negation, several
 * columns or no literal is not guessed (the table then stays "unseeded" and is reported as such).
 */
async function valueFromCheck(su: pg.Client, table: string, constraint: string, wanted: ColumnInfo[]): Promise<{ column: string; value: string } | null> {
  const def = (await su.query(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = $1 AND conrelid = $2::regclass`, [constraint, `public."${table}"`])).rows[0]?.def as string | undefined;
  if (!def || /<>|!=|\bNOT\b/i.test(def) || !/=\s*(ANY\s*\(\s*\(?ARRAY\[|')/i.test(def)) return null;
  const mentioned = wanted.filter((c) => new RegExp(`\\b${c.name}\\b`).test(def));
  if (mentioned.length !== 1) return null;
  const literal = def.match(/'([^']+)'/);
  return literal ? { column: mentioned[0].name, value: literal[1] } : null;
}

/** Inserts one synthetic row for `tenantId` into `table` (superuser, FK/trigger checks off). Returns the column list and values, or the reason it cannot be seeded. */
export async function seedGenericRow(su: pg.Client, table: string, tenantId: string): Promise<{ ok: true; cols: ColumnInfo[]; values: unknown[] } | { ok: false; reason: string }> {
  const cols = (await su.query(
    `SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type, c.data_type AS data_type, c.udt_name AS udt
       FROM pg_attribute a
       JOIN pg_class k ON k.oid = a.attrelid AND k.relname = $1
       JOIN pg_namespace n ON n.oid = k.relnamespace AND n.nspname = 'public'
       JOIN information_schema.columns c ON c.table_schema = 'public' AND c.table_name = $1 AND c.column_name = a.attname
      WHERE a.attnum > 0 AND NOT a.attisdropped AND a.attnotnull AND a.attgenerated::text = '' AND c.column_default IS NULL AND c.is_identity = 'NO'
      ORDER BY a.attnum`, [table])).rows;
  const wanted: ColumnInfo[] = cols.map((c) => ({ name: String(c.name), type: String(c.type), dataType: String(c.data_type), udt: String(c.udt) }));
  if (!wanted.some((c) => c.name === 'tenant_id')) wanted.unshift({ name: 'tenant_id', type: 'uuid', dataType: 'uuid', udt: 'uuid' });

  const sql = `INSERT INTO public."${table}" (${wanted.map((c) => `"${c.name}"`).join(', ')}) VALUES (${wanted.map((c, i) => `$${i + 1}::${c.type}`).join(', ')})`;
  const learned = new Map<string, unknown>();
  for (let attempt = 0; attempt < 8; attempt++) {
    const values: unknown[] = [];
    for (const c of wanted) {
      if (learned.has(c.name)) { values.push(learned.get(c.name)); continue; }
      const v = await valueFor(su, c, tenantId);
      if (!v.ok) return v;
      values.push(v.value);
    }
    await su.query('SAVEPOINT seed');
    try {
      await su.query('SET LOCAL session_replication_role = replica');
      await su.query(sql, values as never[]);
      await su.query('RELEASE SAVEPOINT seed');
      return { ok: true, cols: wanted, values };
    } catch (e) {
      await su.query('ROLLBACK TO SAVEPOINT seed');
      const err = e as Error & { code?: string; constraint?: string };
      if (err.code !== '23514' || !err.constraint) return { ok: false, reason: err.message.slice(0, 120) };
      const next = await valueFromCheck(su, table, err.constraint, wanted);
      if (!next) return { ok: false, reason: `check ${err.constraint}: not a simple value list` };
      learned.set(next.column, next.value);
    }
  }
  return { ok: false, reason: 'check constraints still unsatisfied after 8 attempts' };
}

export function genericInsert(table: string, cols: ColumnInfo[], values: unknown[], tenantId: string): { sql: string; params: unknown[] } {
  const params = cols.map((c, i) => (c.name === 'tenant_id' ? tenantId : values[i]));
  return {
    sql: `INSERT INTO public."${table}" (${cols.map((c) => `"${c.name}"`).join(', ')}) VALUES (${cols.map((c, i) => `$${i + 1}::${c.type}`).join(', ')})`,
    params,
  };
}
