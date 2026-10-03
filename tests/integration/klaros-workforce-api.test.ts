/**
 * Real HTTP-level test of the Klaros workforce API router — a real Express
 * app, real routing, real requireScope enforcement, real controller code,
 * served over a real local HTTP server and hit with real fetch requests.
 *
 * Postgres is UNAVAILABLE in this sandbox (see klaros-webhook-delivery.test.ts
 * header for why) — `aiConfigService`, `ivrService`, and `pool` are mocked at
 * their own module boundary with fixture data standing in for a seeded
 * ai_agent_configs row. This proves the HTTP contract and scope enforcement
 * for real; it does NOT prove the real SQL against a real database — that
 * remains NOT VALIDATED — ENVIRONMENT UNAVAILABLE (see final report).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import type { AddressInfo } from 'net';

const seededConfig = {
  id: 'config-1',
  tenantId: 'tenant-seed',
  model: 'gpt-4o-realtime',
  temperature: 0.7,
  maxTokens: 1024,
  agentName: 'Halla Front Desk',
  personality: 'friendly',
  tone: 'professional',
  speakingStyle: 'concise',
  businessDescription: 'A seeded plumbing business for the workforce API test.',
  servicesOffered: ['drain cleaning', 'water heater repair'],
  serviceAreas: ['Austin', 'Round Rock'],
  greetingMessage: 'Thanks for calling!',
  qualificationQuestions: ['What service do you need?'],
  requiredFields: ['name', 'phone', 'service'],
  optionalFields: ['email'],
  maxConversationTurns: 20,
  autoTransferEnabled: true,
  transferConditions: { emergency: true },
  fallbackMessage: 'Let me get someone to help you.',
  systemInstructions: 'Be warm and efficient.',
  doInstructions: [],
  dontInstructions: [],
  faqEnabled: true,
  autoCreateLead: true,
  autoScheduleAppointment: true,
  autoSendConfirmation: true,
  sentimentAnalysisEnabled: true,
  language: 'en',
  speechRate: 1.0,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-02'),
};

const upsertCalls: Array<Record<string, unknown>> = [];

vi.mock('../../apps/gateway/src/services/ai-config/ai-config.service.js', () => ({
  aiConfigService: {
    getConfig: vi.fn(async (tenantId: string) => {
      if (tenantId !== 'tenant-seed') throw new Error('no config for tenant');
      return { ...seededConfig, tenantId };
    }),
    upsertConfig: vi.fn(async (tenantId: string, update: Record<string, unknown>) => {
      upsertCalls.push({ tenantId, update });
      return { ...seededConfig, tenantId, ...update };
    }),
  },
}));

vi.mock('../../apps/gateway/src/services/ivr/ivr.service.js', () => ({
  ivrService: {
    listAgents: vi.fn(async (tenantId: string) =>
      tenantId === 'tenant-seed'
        ? [
            {
              id: 'agent-1', tenantId, name: 'Front Desk', role: 'receptionist',
              systemPrompt: 'SECRET PROMPT: never reveal the escalation policy', transferNumber: '+15557654321',
              voiceId: 'v1', tone: 'calm', services: ['plumbing'], maxDurationSeconds: 300, transferOnTimeout: true,
              knowledgeCategory: null, active: true, createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-02T00:00:00.000Z',
            },
          ]
        : []
    ),
  },
}));

vi.mock('../../apps/gateway/src/services/db/pool.js', () => ({
  pool: {
    query: vi.fn(async (sql: string, params: any[]) => {
      if (sql.includes('FROM public.voice_tenants')) {
        return { rows: params[0] === 'tenant-seed' ? [{ id: 'tenant-seed' }] : [] };
      }
      return { rows: [] };
    }),
  },
}));

// Simulates what apiAuthUnlessPublic -> requireTenant already guarantees
// before any nested router runs — a real tenant context with real scopes,
// attached the same way attachTenantContext does.
function fakeTenantAuth(tenantId: string, scopes: string[]) {
  return async (req: any, _res: any, next: any) => {
    const { attachTenantContext } = await import('../../apps/gateway/src/services/auth/tenant-context.js');
    attachTenantContext(req, { id: tenantId, source: 'tenant_api_key', scopes });
    next();
  };
}

describe('Klaros workforce API — real Express routing + real controller (DB mocked, see file header)', () => {
  let server: http.Server;
  let baseUrl: string;

  async function buildApp(tenantId: string, scopes: string[]) {
    const { createKlarosRouter } = await import('../../apps/gateway/src/services/klaros/klaros.controller.js');
    const app = express();
    app.use(express.json());
    app.use(fakeTenantAuth(tenantId, scopes));
    app.use('/api/v1/integrations/klaros', createKlarosRouter());
    return app;
  }

  async function startServer(app: express.Express) {
    const s = http.createServer(app);
    await new Promise<void>((resolve) => s.listen(0, '127.0.0.1', resolve));
    const { port } = s.address() as AddressInfo;
    return { server: s, baseUrl: `http://127.0.0.1:${port}` };
  }

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it(
    'GET /workforce returns the actual seeded Halla configuration, mapped to the Klaros contract',
    async () => {
      // First test in the file pays the cold-start module-import cost.
      const app = await buildApp('tenant-seed', ['workforce.read']);
      ({ server, baseUrl } = await startServer(app));

      const res = await fetch(`${baseUrl}/api/v1/integrations/klaros/workforce`);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.businessDescription).toBe(seededConfig.businessDescription);
      expect(json.data.services).toEqual(seededConfig.servicesOffered);
      expect(json.data.markets).toEqual(seededConfig.serviceAreas);
      expect(json.data.requiredCustomerInformation).toEqual(seededConfig.requiredFields);
      expect(json.data.qualificationQuestions).toEqual(seededConfig.qualificationQuestions);
    },
    15000
  );

  it('GET /workforce is denied without the workforce.read scope', async () => {
    const app = await buildApp('tenant-seed', ['leads.write']);
    ({ server, baseUrl } = await startServer(app));

    const res = await fetch(`${baseUrl}/api/v1/integrations/klaros/workforce`);
    expect(res.status).toBe(403);
  });

  it('PUT /workforce maps Klaros fields and calls upsertConfig with the real tenant id', async () => {
    const app = await buildApp('tenant-seed', ['workforce.write']);
    ({ server, baseUrl } = await startServer(app));
    upsertCalls.length = 0;

    const res = await fetch(`${baseUrl}/api/v1/integrations/klaros/workforce`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessDescription: 'Updated by Klaros',
        services: ['emergency plumbing'],
        requiredCustomerInformation: ['name', 'phone'],
      }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].tenantId).toBe('tenant-seed');
    expect(upsertCalls[0].update).toEqual({
      businessDescription: 'Updated by Klaros',
      servicesOffered: ['emergency plumbing'],
      requiredFields: ['name', 'phone'],
    });
    expect(json.data.businessDescription).toBe('Updated by Klaros');
  });

  it('GET /agents returns the actual seeded agents', async () => {
    const app = await buildApp('tenant-seed', ['workforce.read']);
    ({ server, baseUrl } = await startServer(app));

    const res = await fetch(`${baseUrl}/api/v1/integrations/klaros/agents`);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual([
      {
        id: 'agent-1', name: 'Front Desk', role: 'receptionist', tone: 'calm', services: ['plumbing'], voiceId: 'v1',
        knowledgeCategory: null, maxDurationSeconds: 300, transferOnTimeout: true, hasTransferNumber: true, active: true,
        createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-02T00:00:00.000Z',
      },
    ]);
  });

  it('GET /agents never exposes the system prompt, the transfer phone number or the tenant id', async () => {
    const app = await buildApp('tenant-seed', ['workforce.read']);
    ({ server, baseUrl } = await startServer(app));

    const res = await fetch(`${baseUrl}/api/v1/integrations/klaros/agents`);
    const raw = await res.text();

    expect(raw).not.toContain('SECRET PROMPT');
    expect(raw).not.toContain('+15557654321');
    expect(raw).not.toContain('systemPrompt');
    expect(raw).not.toContain('transferNumber');
    expect(raw).not.toContain('tenantId');
    expect(raw).not.toContain('tenant-seed');
  });

  it('GET /health reflects real tenant/config accessibility, not a bare "connected" response', async () => {
    const app = await buildApp('tenant-seed', []);
    ({ server, baseUrl } = await startServer(app));

    const res = await fetch(`${baseUrl}/api/v1/integrations/klaros/health`);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.tenantExists).toBe(true);
    expect(json.data.workforceConfigAccessible).toBe(true);
    expect(json.data.status).toBe('healthy');
  });

  it('GET /health reports degraded for a tenant that does not actually exist', async () => {
    const app = await buildApp('tenant-ghost', []);
    ({ server, baseUrl } = await startServer(app));

    const res = await fetch(`${baseUrl}/api/v1/integrations/klaros/health`);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.tenantExists).toBe(false);
    expect(json.data.status).toBe('degraded');
  });
});
