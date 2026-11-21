/**
 * Finds SQL in source code that touches a client-data table (one with a tenant_id column) without mentioning tenant_id.
 * The gateway talks to the database with one privileged connection that skips row-level security, so every query must carry the
 * client filter itself. This is a safety net, not a proof: it cannot tell a query that is safe because the row was already
 * loaded with the filter earlier in the same function from one that is a leak. Those are reviewed by hand and listed.
 */

export function tenantTablesFromSql(sql: string): Set<string> {
  const tables = new Set<string>();
  const create = /create table(?: if not exists)?\s+(?:public\.)?([a-z_0-9]+)\s*\((.*?)\n\s*\)\s*;/gis;
  for (const m of sql.matchAll(create)) {
    if (/\btenant_id\b/i.test(m[2])) tables.add(m[1].toLowerCase());
  }
  return tables;
}

export interface UnfilteredStatement {
  table: string;
  line: number;
  text: string;
  /** Stable across line moves and spacing changes. The caller adds the file name. */
  key: string;
}

const STRING_LITERAL = /(`(?:[^`\\]|\\.)*`|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")/gs;
const STATEMENT = /\b(select\b.*?\bfrom|update|delete\s+from|insert\s+into)\s+(?:only\s+)?(?:public\.)?([a-z_0-9]+)/is;
const IS_SQL_VERB = /\b(select|update|delete|insert)\b/i;
const MENTIONS_TENANT = /tenant_id|tenantid|\$\d.*tenant/i;

export function findUnfilteredStatements(source: string, tables: Set<string>): UnfilteredStatement[] {
  const out: UnfilteredStatement[] = [];
  for (const m of source.matchAll(STRING_LITERAL)) {
    const text = m[1];
    if (!IS_SQL_VERB.test(text)) continue;
    const st = STATEMENT.exec(text);
    if (!st) continue;
    const table = st[2].toLowerCase();
    if (!tables.has(table)) continue;
    if (MENTIONS_TENANT.test(text)) continue;
    const normalized = text.replace(/\s+/g, ' ').trim();
    out.push({
      table,
      line: source.slice(0, m.index).split('\n').length,
      text: normalized.slice(0, 110),
      key: `${table}::${normalized.slice(0, 90).toLowerCase()}`,
    });
  }
  return out;
}
