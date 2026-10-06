/**
 * F9: read-only, tenant-scoped order lookup.
 *
 * STATE: ORDER_LOOKUP = BLOCKED_PENDING_KLAROS_READ_API. There is no real order provider; the tests below use a FAKE
 * provider to prove the SAFE SHAPE (isolation, allow-listing, read-only, RBAC). They do not prove that Halla can read
 * a real order, because it cannot yet — and the first group of tests proves it says so rather than inventing one.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import type { AddressInfo } from 'net';

vi.mock('../../../apps/gateway/src/services/ai-config/ai-config.service.js', () => ({ aiConfigService: { getConfig: vi.fn(), upsertConfig: vi.fn() } }));
vi.mock('../../../apps/gateway/src/services/ivr/ivr.service.js', () => ({ ivrService: { listAgents: vi.fn(async () => []) } }));
vi.mock('../../../apps/gateway/src/services/db/pool.js', () => ({ pool: { query: vi.fn(async () => ({ rows: [] })) } }));

import * as orderLookupModule from '../../../apps/gateway/src/services/order-lookup/order-lookup.service.js';
import {
  lookupOrder, registerOrderLookupProvider, clearOrderLookupProvider, isOrderLookupAvailable, orderLookupCapability,
  isValidOrderReference, ORDER_LOOKUP_BLOCKED, type OrderLookupProvider,
} from '../../../apps/gateway/src/services/order-lookup/order-lookup.service.js';
import { buildToolsList } from '../../../apps/gateway/src/services/realtime/realtime-tool-schemas.js';
import { RealtimeToolsManager } from '../../../apps/gateway/src/services/realtime/realtime.tools.js';
import { evaluateRuntimePermissions } from '../../../apps/gateway/src/services/ai-governance/runtime-permissions.js';
import { evaluateApiKeyPolicy } from '../../../apps/gateway/src/security/api-key-scope-policy.js';
import { WORKFORCE_TEMPLATES, validateWorkforceTemplate } from '../../../apps/gateway/src/services/workforce-templates/index.js';
import type { TenantAiRuntimeConfig } from '../../../apps/gateway/src/services/ai-governance/ai-runtime-config.js';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** A provider record that carries everything that must NEVER leave the module. */
const richRecord = (tenantId: string, reference: string) => ({
  tenantId, reference, orderStatus: 'confirmed', paymentStatus: 'paid', fulfillmentStatus: 'fulfilled', shipmentStatus: 'in_transit',
  trackingNumber: 'TRK-123456', returnStatus: 'none', refundStatus: 'none', updatedAt: '2026-10-01T10:00:00Z',
  // must be dropped:
  supplierCost: 11.5, internalMargin: 0.4, supplierName: 'Acme Wholesale', supplierApiKey: 'sk_live_supplier_secret_123',
  customerEmail: 'someone@example.com', customerPhone: '+971501234567', customerName: 'Some One', shippingAddress: '1 Main St', cardLast4: '4242', notes: 'internal note',
});

const providerOf = (impl: OrderLookupProvider['lookup']): OrderLookupProvider => ({ name: 'fake-test-provider', lookup: impl });

beforeEach(() => clearOrderLookupProvider());
afterAll(() => clearOrderLookupProvider());

describe('F9 state: with no provider the capability is BLOCKED and says so', () => {
  it('reports BLOCKED_PENDING_KLAROS_READ_API and is unavailable', () => {
    expect(orderLookupCapability()).toBe('BLOCKED_PENDING_KLAROS_READ_API');
    expect(ORDER_LOOKUP_BLOCKED).toBe('BLOCKED_PENDING_KLAROS_READ_API');
    expect(isOrderLookupAvailable()).toBe(false);
  });

  it('a lookup returns a structured blocked outcome and never an invented order', async () => {
    const out = await lookupOrder(TENANT_A, 'ORD-1001');
    expect(out).toMatchObject({ ok: false, code: 'BLOCKED_PENDING_KLAROS_READ_API' });
    expect(out.order).toBeUndefined();
  });

  it('the tool is not offered to the model at all, even to a tenant that opted in', () => {
    const tools = buildToolsList({ capabilities: { orderLookup: true }, transferPhoneNumber: '+10000000000' } as never, 'professional');
    expect(tools.map((t) => t.name)).not.toContain('lookup_order');
  });

  it('calling the tool anyway returns the blocked code and tells the agent to escalate, with no status', async () => {
    const r = await new RealtimeToolsManager().executeToolDirect({ id: 's', tenantId: TENANT_A, callSid: 'CA1' } as never, 'lookup_order', { order_reference: 'ORD-1001' });
    expect(r.success).toBe(false);
    expect(r.error).toBe('BLOCKED_PENDING_KLAROS_READ_API');
    expect(r.message).toMatch(/Do not state any order, payment, refund or tracking status/);
    expect(r.data).toBeUndefined();
  });

  it('the Dropshipping template still tells every agent that no order tool exists (so they escalate)', () => {
    for (const a of WORKFORCE_TEMPLATES.dropshipping.agents) {
      expect(a.systemPrompt).toMatch(/You currently have NO tool that reads order, payment, refund, shipment or tracking records/);
    }
    expect(WORKFORCE_TEMPLATES.dropshipping.knownPlatformGaps.join(' ')).toMatch(/No order, payment, refund, shipment or tracking lookup tool exists/);
  });
});

describe('F9 safe identifier: validated before any provider is called', () => {
  const lookup = vi.fn(async () => null);
  beforeEach(() => { lookup.mockClear(); registerOrderLookupProvider(providerOf(lookup)); });

  it.each([
    "1; DROP TABLE orders;--", "' OR '1'='1", 'https://evil.example/orders/1', '../../etc/passwd', 'ORD 1001', '', 'AB', 'x'.repeat(41),
    'ORD-1001\n', 'ORD/1001', 'ORD?x=1', '<script>', 'ORD-１００１', null, undefined, 12345, { $ne: 1 }, ['ORD-1001'],
  ])('rejects %j without calling the provider', async (bad) => {
    const out = await lookupOrder(TENANT_A, bad);
    expect(out).toMatchObject({ ok: false, code: 'INVALID_REFERENCE' });
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each(['ORD-1001', 'abc123', 'A1_b2-C3', 'x'.repeat(40)])('accepts %s', (good) => {
    expect(isValidOrderReference(good)).toBe(true);
  });
});

describe('F9 tenant isolation and allow-listed output', () => {
  it('passes the tenant from the authenticated context, never from the input', async () => {
    const seen: Array<{ tenantId: string; reference: string }> = [];
    registerOrderLookupProvider(providerOf(async (req) => { seen.push(req); return richRecord(req.tenantId, req.reference); }));
    await lookupOrder(TENANT_A, 'ORD-1001');
    expect(seen).toEqual([{ tenantId: TENANT_A, reference: 'ORD-1001' }]);
  });

  it("never returns another tenant's order, and answers exactly like 'not found' (no existence leak)", async () => {
    registerOrderLookupProvider(providerOf(async (req) => richRecord(TENANT_B, req.reference)));
    const cross = await lookupOrder(TENANT_A, 'ORD-1001');
    registerOrderLookupProvider(providerOf(async () => null));
    const missing = await lookupOrder(TENANT_A, 'ORD-1001');
    expect(cross).toEqual(missing);
    expect(cross).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(JSON.stringify(cross)).not.toContain('TRK-123456');
  });

  it('returns ONLY the allow-listed fields: no cost, margin, supplier, credential, customer or card data', async () => {
    registerOrderLookupProvider(providerOf(async (req) => richRecord(req.tenantId, req.reference)));
    const out = await lookupOrder(TENANT_A, 'ORD-1001');
    expect(out.ok).toBe(true);
    expect(Object.keys(out.order!).sort()).toEqual(['fulfillmentStatus', 'orderStatus', 'paymentStatus', 'reference', 'refundStatus', 'returnStatus', 'shipmentStatus', 'trackingNumber', 'updatedAt']);
    expect(out.order).toMatchObject({ reference: 'ORD-1001', orderStatus: 'confirmed', paymentStatus: 'paid', fulfillmentStatus: 'fulfilled', shipmentStatus: 'in_transit', trackingNumber: 'TRK-123456', returnStatus: 'none', refundStatus: 'none' });
    const blob = JSON.stringify(out);
    for (const secret of ['11.5', 'margin', 'Acme', 'sk_live', 'someone@example.com', '+971501234567', 'Some One', 'Main St', '4242', 'internal note']) {
      expect(blob, secret).not.toContain(secret);
    }
  });

  it("an unrecognised status becomes 'unknown' (never passed through, never guessed); a malformed tracking number is dropped", async () => {
    registerOrderLookupProvider(providerOf(async (req) => ({ ...richRecord(req.tenantId, req.reference), paymentStatus: 'paid-ish', refundStatus: { x: 1 }, shipmentStatus: '', trackingNumber: 'http://carrier.example/?id=1', updatedAt: 'not a date' })));
    const out = await lookupOrder(TENANT_A, 'ORD-1001');
    expect(out.order).toMatchObject({ paymentStatus: 'unknown', refundStatus: 'unknown', shipmentStatus: 'unknown', trackingNumber: null, updatedAt: null });
  });

  it('a provider failure or timeout yields a generic error with no detail', async () => {
    registerOrderLookupProvider(providerOf(async () => { throw new Error('ECONNREFUSED https://internal.klaros/orders?customer=jane@example.com'); }));
    const out = await lookupOrder(TENANT_A, 'ORD-1001');
    expect(out).toMatchObject({ ok: false, code: 'PROVIDER_ERROR' });
    expect(JSON.stringify(out)).not.toMatch(/internal|jane|ECONNREFUSED/);
  });
});

describe('F9 read-only: nothing in the capability can change an order, take money or contact a carrier', () => {
  it('the module exports no mutating operation, and a provider has exactly one method: lookup', () => {
    const exported = Object.entries(orderLookupModule).filter(([, v]) => typeof v === 'function').map(([k]) => k); // functions only: constants such as PAYMENT_STATUSES are vocabularies, not operations
    expect(exported.filter((n) => /(create|update|delete|cancel|refund|charge|pay|capture|ship|dispatch|fulfil|send|issue|modify|set(?!Order))/i.test(n.replace('registerOrderLookupProvider', '').replace('clearOrderLookupProvider', '')))).toEqual([]);
    const provider: OrderLookupProvider = { name: 'x', lookup: async () => null };
    expect(Object.keys(provider).sort()).toEqual(['lookup', 'name']);
  });

  it('the lookup tool is classed as a read in the risk model, with a per-call cap', () => {
    const cfg: TenantAiRuntimeConfig = {
      tenantId: TENANT_A, governanceEnabled: true, safetyMode: 'standard', riskTolerance: 'standard', allowedTools: [], disabledTools: [],
      confirmationRequiredTools: [], executionLimits: { maxExecutionsPerCall: 25, maxExecutionsPerMinute: 40, toolCooldownMs: 800, maxToolDepth: 12 },
      autoCreateLead: true, autoScheduleAppointment: false, autoSendConfirmation: false, policyVersion: 'p3-v1',
    };
    const d = evaluateRuntimePermissions(cfg, 'lookup_order');
    expect(d.allowed).toBe(true);
    expect(d.policy).toMatchObject({ riskLevel: 'medium', maxExecutionsPerCall: 3 });
  });
});

describe('F9 availability: only Dropshipping can ever use it, and only once a provider exists', () => {
  it('Medical Tourism disables lookup_order in governance, and the validator insists on it', () => {
    const t = WORKFORCE_TEMPLATES.medical_tourism;
    expect(t.governanceSandbox.disabledTools).toContain('lookup_order');
    const cfg = { tenantId: TENANT_A, governanceEnabled: true, safetyMode: 'standard', riskTolerance: 'standard', allowedTools: [], disabledTools: t.governanceSandbox.disabledTools, confirmationRequiredTools: [], executionLimits: t.governanceSandbox.executionLimits, autoCreateLead: true, autoScheduleAppointment: false, autoSendConfirmation: false, policyVersion: 'p3-v1' } as TenantAiRuntimeConfig;
    expect(evaluateRuntimePermissions(cfg, 'lookup_order')).toMatchObject({ allowed: false, reason: 'Tool lookup_order disabled by policy' });
    const broken = JSON.parse(JSON.stringify(t));
    broken.governanceSandbox.disabledTools = broken.governanceSandbox.disabledTools.filter((x: string) => x !== 'lookup_order');
    expect(validateWorkforceTemplate(broken).join('|')).toMatch(/medical tourism must disable lookup_order/);
  });

  it('the tool is offered only when a provider is registered AND the tenant opted in', () => {
    const offered = (caps: Record<string, boolean>) => buildToolsList({ capabilities: caps, transferPhoneNumber: '+10000000000' } as never, 'professional').map((t) => t.name).includes('lookup_order');
    registerOrderLookupProvider(providerOf(async () => null));
    expect(offered({ orderLookup: true })).toBe(true);
    expect(offered({})).toBe(false); // not opted in (e.g. a Medical Tourism tenant)
    expect(offered({ orderLookup: false })).toBe(false);
    const schema = buildToolsList({ capabilities: { orderLookup: true } } as never, 'professional').find((t) => t.name === 'lookup_order');
    expect(schema.description).toMatch(/Read-only: it cannot change an order, take a payment, issue a refund or contact a carrier/);
    expect(Object.keys(schema.parameters.properties)).toEqual(['order_reference']); // no tenant, no free text, no URL
  });

  it('with a provider, the tool returns the allow-listed view for the SESSION tenant and ignores a tenant smuggled into the parameters', async () => {
    const seen: string[] = [];
    registerOrderLookupProvider(providerOf(async (req) => { seen.push(req.tenantId); return richRecord(req.tenantId, req.reference); }));
    const r = await new RealtimeToolsManager().executeToolDirect({ id: 's-provider', tenantId: TENANT_A, callSid: 'CA-provider' } as never, 'lookup_order', { order_reference: 'ORD-1001', tenantId: TENANT_B, tenant_id: TENANT_B });
    expect(seen).toEqual([TENANT_A]);
    expect(r.success).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/supplier|margin|someone@example|Some One|4242/);
  });
});

describe('F9 RBAC: a dedicated scope, read-only verbs only', () => {
  const url = '/api/v1/integrations/klaros/orders/ORD-1001';

  it('GET needs orders.read; workforce.read and a key with other scopes cannot read orders', () => {
    expect(evaluateApiKeyPolicy('GET', url, ['orders.read'])).toMatchObject({ allowed: true, scope: 'orders.read' });
    expect(evaluateApiKeyPolicy('GET', url, ['workforce.read', 'workforce.write', 'leads.read', 'calls.read', 'webhooks.manage'])).toMatchObject({ allowed: false, reason: 'missing_scope', scope: 'orders.read' });
    expect(evaluateApiKeyPolicy('GET', url, [])).toMatchObject({ allowed: false });
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s on an order is not reachable by an API key even with every scope (read-only)', (verb) => {
    expect(evaluateApiKeyPolicy(verb, url, ['orders.read', 'workforce.write', 'leads.write', 'calls.write', 'webhooks.manage'])).toMatchObject({ allowed: false, reason: 'unclassified_route' });
  });

  it.each(['/api/v1/integrations/klaros/orders', '/api/v1/integrations/klaros/orders/ORD-1/refund', '/api/v1/integrations/klaros/orders/ORD-1/cancel', '/api/v1/integrations/klaros/orders/a b'])('only the single-order GET exists: %s', (p) => {
    expect(evaluateApiKeyPolicy('GET', p, ['orders.read'])).toMatchObject({ allowed: false, reason: 'unclassified_route' });
  });
});

describe('F9 HTTP route (real Express router, real scope enforcement)', () => {
  let server: http.Server | undefined;
  afterAll(async () => { if (server) await new Promise<void>((r) => server!.close(() => r())); });

  async function serve(tenantId: string, scopes: string[]) {
    if (server) await new Promise<void>((r) => server!.close(() => r()));
    const { createKlarosRouter } = await import('../../../apps/gateway/src/services/klaros/klaros.controller.js');
    const { attachTenantContext } = await import('../../../apps/gateway/src/services/auth/tenant-context.js');
    const app = express();
    app.use((req, _res, next) => { attachTenantContext(req as never, { id: tenantId, source: 'tenant_api_key', scopes } as never); next(); });
    app.use('/api/v1/integrations/klaros', createKlarosRouter());
    server = http.createServer(app);
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/integrations/klaros/orders`;
  }

  it('403 without orders.read (workforce.read is not enough)', async () => {
    const base = await serve(TENANT_A, ['workforce.read']);
    expect((await fetch(`${base}/ORD-1001`)).status).toBe(403);
  }, 20000);

  it('501 ORDER_LOOKUP_BLOCKED_PENDING_KLAROS_READ_API while no provider exists — no data', async () => {
    const base = await serve(TENANT_A, ['orders.read']);
    const res = await fetch(`${base}/ORD-1001`);
    expect(res.status).toBe(501);
    expect(await res.json()).toMatchObject({ success: false, code: 'BLOCKED_PENDING_KLAROS_READ_API' });
  });

  it('400 for an invalid reference, and the provider is never called', async () => {
    const lookup = vi.fn(async () => null);
    registerOrderLookupProvider(providerOf(lookup));
    const base = await serve(TENANT_A, ['orders.read']);
    expect((await fetch(`${base}/${encodeURIComponent("1;DROP TABLE orders")}`)).status).toBe(400);
    expect((await fetch(`${base}/ab`)).status).toBe(400);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("200 with the allow-listed view for the key's own tenant; another tenant's order is a 404; write verbs are not routed", async () => {
    registerOrderLookupProvider(providerOf(async (req) => (req.reference === 'ORD-OTHER' ? richRecord(TENANT_B, req.reference) : richRecord(req.tenantId, req.reference))));
    const base = await serve(TENANT_A, ['orders.read']);
    const ok = await fetch(`${base}/ORD-1001`);
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.data).toMatchObject({ reference: 'ORD-1001', paymentStatus: 'paid', trackingNumber: 'TRK-123456' });
    expect(JSON.stringify(body)).not.toMatch(/supplier|margin|someone@example|Some One|4242|sk_live/);
    expect((await fetch(`${base}/ORD-OTHER`)).status).toBe(404);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) expect((await fetch(`${base}/ORD-1001`, { method })).status, method).toBe(404);
  });
});
