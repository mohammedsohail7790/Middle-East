import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

vi.mock('../../apps/gateway/src/services/knowledge/knowledge-file-parser.js', () => ({
  extractKnowledgeText: vi.fn(async () => 'Parsed PDF text'),
}));
import { createDocumentRouter } from '../../apps/gateway/src/services/automation-engine/document.router.js';
import { registerAllTemplates } from '../../apps/gateway/src/services/automation-engine/templates/index.js';

const T = '11111111-1111-4111-8111-111111111111';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20, 1)]);
const PDF = Buffer.from('%PDF-1.4\n fake body');

let server: Server;
let base = '';
let allowed = true;
let enabled = true;
const emit = vi.fn(async () => {});
const getAutomation = vi.fn(async () => (enabled ? ({ enabled: true } as never) : null));

beforeEach(async () => {
  registerAllTemplates();
  allowed = true; enabled = true; emit.mockClear(); getAutomation.mockClear();
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.tenant = { id: T, userId: 'u1', source: 'user_jwt' }; next(); });
  app.use('/documents', createDocumentRouter({ db: async () => ({ query: vi.fn() }) as never, canWrite: async () => allowed, getAutomation: getAutomation as never, emit: emit as never }));
  await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/documents`;
});
afterEach(async () => { await new Promise((r) => server.close(r)); });

const upload = (bytes: Buffer, name: string, extra: Record<string, string> = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  fd.append('file', new Blob([bytes]), name);
  return fetch(base, { method: 'POST', body: fd });
};

describe('POST /documents', () => {
  it('accepts a PDF, emits document.received with text and the content hash, stores nothing', async () => {
    const res = await upload(PDF, 'invoice.pdf');
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j).toEqual({ success: true, data: { ref: createHash('sha256').update(PDF).digest('hex') } });
    expect(emit).toHaveBeenCalledWith(T, 'document.received', j.data.ref, { fileName: 'invoice.pdf', text: 'Parsed PDF text' });
    expect(getAutomation.mock.calls[0][2]).toBe('document-intake');
  });

  it('sends a photo as a data url, and plain text as text', async () => {
    await upload(PNG, 'receipt.png');
    expect((emit.mock.calls[0] as any)[3].imageDataUrl).toMatch(/^data:image\/png;base64,/);
    await upload(Buffer.from('Name: Sara'), 'note.txt');
    expect((emit.mock.calls[1] as any)[3]).toEqual({ fileName: 'note.txt', text: 'Name: Sara' });
  });

  it('gives the same ref for the same file twice', async () => {
    const a = await (await upload(PDF, 'a.pdf')).json();
    const b = await (await upload(PDF, 'renamed.pdf')).json();
    expect(a.data.ref).toBe(b.data.ref);
  });

  it('refuses a wrong type, a signature mismatch and an oversize file', async () => {
    expect((await upload(Buffer.from('MZ'), 'run.exe')).status).toBe(415);
    expect((await upload(Buffer.from('<html></html>'), 'page.pdf')).status).toBe(415);
    expect((await upload(PNG, 'fake.pdf')).status).toBe(415);
    expect((await upload(PDF, 'sneaky.png')).status).toBe(415);
    expect((await upload(Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(8 * 1024 * 1024)]), 'big.pdf')).status).toBe(413);
    expect((await upload(Buffer.alloc(9 * 1024 * 1024 + 100, 65), 'huge.txt')).status).toBe(413);
    expect(emit).not.toHaveBeenCalled();
  });

  it('refuses when the automation is not switched on, unknown, or not about documents', async () => {
    enabled = false;
    expect((await upload(PDF, 'a.pdf')).status).toBe(409);
    enabled = true;
    expect((await upload(PDF, 'a.pdf', { automation: 'nope' })).status).toBe(400);
    expect((await upload(PDF, 'a.pdf', { automation: 'lead-to-crm' })).status).toBe(400);
    expect(emit).not.toHaveBeenCalled();
  });

  it('refuses without permission, without a file and without multipart', async () => {
    allowed = false;
    expect((await upload(PDF, 'a.pdf')).status).toBe(403);
    allowed = true;
    expect((await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(415);
    const fd = new FormData(); fd.append('automation', 'document-intake');
    expect((await fetch(base, { method: 'POST', body: fd })).status).toBe(400);
    expect(emit).not.toHaveBeenCalled();
  });
});
