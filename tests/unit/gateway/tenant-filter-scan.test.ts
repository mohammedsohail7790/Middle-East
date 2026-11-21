/** The scanner behind the tenant-filter guard: it must flag a query on client data that has no client filter, and nothing else. */
import { describe, it, expect } from 'vitest';
import { findUnfilteredStatements, tenantTablesFromSql } from '../../helpers/tenant-filter-scan';

const TABLES = new Set(['leads', 'knowledge_files']);

describe('tenantTablesFromSql', () => {
  it('finds tables that have a tenant_id column', () => {
    const sql = `
      CREATE TABLE IF NOT EXISTS public.leads (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        name TEXT
      );
      create table public.plans (
        id text primary key,
        price int
      );`;
    expect([...tenantTablesFromSql(sql)]).toEqual(['leads']);
  });
});

describe('findUnfilteredStatements', () => {
  it('flags an update by id alone on a client table', () => {
    const src = "await db.query(`UPDATE public.leads SET name = $1 WHERE id = $2`, [n, id]);";
    const found = findUnfilteredStatements(src, TABLES);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ table: 'leads', line: 1 });
  });

  it('flags a select by id alone', () => {
    expect(findUnfilteredStatements("q('SELECT * FROM public.knowledge_files WHERE id = $1')", TABLES)).toHaveLength(1);
  });

  it('accepts a statement that filters by tenant_id', () => {
    expect(findUnfilteredStatements("q(`DELETE FROM public.leads WHERE id = $1 AND tenant_id = $2`)", TABLES)).toHaveLength(0);
    expect(findUnfilteredStatements("q(`INSERT INTO public.leads (tenant_id, name) VALUES ($1, $2)`)", TABLES)).toHaveLength(0);
  });

  it('ignores tables that are not client data, and text that is not SQL', () => {
    expect(findUnfilteredStatements("q('UPDATE public.plans SET price = 1 WHERE id = $1')", TABLES)).toHaveLength(0);
    expect(findUnfilteredStatements("const msg = 'Please select a lead from the list';", TABLES)).toHaveLength(0);
  });

  it('reports the line number across a multi-line template', () => {
    const src = "const a = 1;\nconst b = 2;\nawait q(`\n  UPDATE public.leads\n  SET name = $1\n  WHERE id = $2\n`);";
    expect(findUnfilteredStatements(src, TABLES)[0].line).toBe(3);
  });

  it('gives a stable key that does not depend on the line number or spacing', () => {
    const a = findUnfilteredStatements("q(`UPDATE public.leads SET name = $1 WHERE id = $2`)", TABLES)[0];
    const b = findUnfilteredStatements("\n\nq(`UPDATE   public.leads\n   SET name = $1   WHERE id = $2`)", TABLES)[0];
    expect(a.key).toBe(b.key);
  });
});
