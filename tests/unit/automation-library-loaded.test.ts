/** The library screen must list the ready-made automations as soon as the API is up, without waiting for an event to load them. */
import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';

vi.mock('../../apps/gateway/src/services/automation-engine/store.js', async (orig) => ({ ...(await orig<Record<string, unknown>>()), listAutomations: vi.fn(async () => []) }));
import { createAutomationEngineRouter } from '../../apps/gateway/src/services/automation-engine/automation.router.js';

describe('the automation library through the real API', () => {
  it('lists the five ready-made automations, each with its trigger and settings, and none switched on', async () => {
    const app = express();
    app.use((req: any, _res, next) => { req.tenant = { id: '11111111-1111-4111-8111-111111111111', userId: 'u', source: 'user_jwt' }; next(); });
    app.use('/automations', createAutomationEngineRouter({ pool: { query: vi.fn() } as never, canWrite: async () => true }));
    const server = await new Promise<import('node:http').Server>((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    try {
      const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/automations`);
      const body = (await res.json()) as { data: { templates: Array<{ key: string; trigger: string; automation: unknown; config: unknown[]; steps: unknown[] }> } };
      expect(res.status).toBe(200);
      expect(body.data.templates.map((t) => t.key).sort()).toEqual(['document-intake', 'hot-lead-alert', 'lead-to-crm', 'lead-to-spreadsheet', 'missed-call-followup']);
      for (const t of body.data.templates) {
        expect(t.automation).toBeNull();
        expect(t.steps.length).toBeGreaterThan(0);
        expect(t.config.length).toBeGreaterThan(0);
      }
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
