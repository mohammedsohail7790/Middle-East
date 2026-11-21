/**
 * Reprocessing a knowledge file must only ever touch the caller's own file. Before this fix, reprocessFile(fileId, tenantId)
 * looked the file up by id alone and then reset its status, so a user who knew another client's file id could change it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type FileRow = { id: string; tenant_id: string; file_name: string; file_type: string; file_size: number; status: string; chunk_count: number; error: string | null; created_at: Date; updated_at: Date };
const db = vi.hoisted(() => ({ files: [] as any[], queries: [] as Array<{ sql: string; params: unknown[] }> }));

vi.mock('../../../apps/gateway/src/services/voice/tenant-scope.js', () => ({
  voiceDb: {
    query: async (sql: string, params: unknown[] = []) => {
      db.queries.push({ sql, params });
      if (/SELECT \* FROM public\.knowledge_files WHERE id = \$1/i.test(sql)) {
        return { rows: db.files.filter((f) => f.id === params[0]) };
      }
      if (/UPDATE public\.knowledge_files SET status = \$1/i.test(sql)) {
        for (const f of db.files) if (f.id === params[1]) f.status = String(params[0]);
        return { rows: [] };
      }
      return { rows: [] };
    },
  },
}));
vi.mock('../../../apps/gateway/src/services/knowledge/knowledge.service.js', () => ({ knowledgeService: {} }));
vi.mock('../../../apps/gateway/src/services/logger.js', () => ({ logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } }));

import { KnowledgeIngestionService } from '../../../apps/gateway/src/services/knowledge/knowledge-ingestion.service.js';

const file = (id: string, tenant: string, status = 'completed'): FileRow => ({
  id, tenant_id: tenant, file_name: 'a.txt', file_type: 'txt', file_size: 10, status, chunk_count: 3, error: null, created_at: new Date(), updated_at: new Date(),
});

beforeEach(() => {
  db.files = [file('kb_mine', 'tenant-A'), file('kb_theirs', 'tenant-B')];
  db.queries = [];
});

describe('reprocessFile', () => {
  it('reprocesses the caller\'s own file', async () => {
    const ok = await new KnowledgeIngestionService().reprocessFile('kb_mine', 'tenant-A');
    expect(ok).toBe(true);
    expect(db.files.find((f) => f.id === 'kb_mine')!.status).toBe('pending');
  });

  it('refuses another client\'s file and changes nothing', async () => {
    const ok = await new KnowledgeIngestionService().reprocessFile('kb_theirs', 'tenant-A');
    expect(ok).toBe(false);
    expect(db.files.find((f) => f.id === 'kb_theirs')!.status).toBe('completed');
    expect(db.queries.some((q) => /UPDATE public\.knowledge_files/i.test(q.sql))).toBe(false);
    expect(db.queries.some((q) => /DELETE FROM public\.knowledge_base/i.test(q.sql))).toBe(false);
  });

  it('returns false for a file that does not exist', async () => {
    expect(await new KnowledgeIngestionService().reprocessFile('kb_missing', 'tenant-A')).toBe(false);
  });
});
