/**
 * Klaros-driven provisioning: the rules that decide WHO may create a receptionist and WHAT it may be given.
 * Database behaviour (tenant row, key, webhook, rollback) is proven against a real database in the staging run, not here.
 */
import { describe, it, expect } from 'vitest';
import {
  KLAROS_KEY_SCOPES,
  KLAROS_WEBHOOK_EVENTS,
  PROVISIONABLE_VERTICALS,
  KlarosProvisioningError,
  bearerFrom,
  provisioningEnabled,
  secretMatches,
  validateProvisionInput,
} from '../../../apps/gateway/src/services/klaros/klaros-provisioning.service.js';
import { API_KEY_ROUTE_POLICY } from '../../../apps/gateway/src/security/api-key-scope-policy.js';
import { KLAROS_EVENT_TYPES } from '../../../apps/gateway/src/security/klaros-event-types.js';
import { WORKFORCE_TEMPLATES } from '../../../apps/gateway/src/services/workforce-templates/index.js';

const SECRET = 'a'.repeat(40);
const TENANT = '7c1d5a2e-3b4f-4a6d-9e8b-2f0a1c9d4e55';
const good = (over: Record<string, unknown> = {}) => ({
  klarosTenantId: TENANT,
  businessName: 'Atlas Care',
  vertical: 'medical_tourism',
  webhookUrl: `https://klaros.example.com/api/v1/webhooks/halla/${TENANT}`,
  rotate: false,
  ...over,
});
const rejects = (body: unknown, re: RegExp) => {
  try {
    validateProvisionInput(body);
  } catch (e) {
    expect(e).toBeInstanceOf(KlarosProvisioningError);
    expect((e as Error).message).toMatch(re);
    return;
  }
  throw new Error('expected a rejection');
};

describe('the platform secret', () => {
  it('is off unless a long secret is configured', () => {
    expect(provisioningEnabled({})).toBe(false);
    expect(provisioningEnabled({ KLAROS_PROVISIONING_SECRET: 'short' })).toBe(false);
    expect(provisioningEnabled({ KLAROS_PROVISIONING_SECRET: SECRET })).toBe(true);
  });

  it('accepts only the exact secret, and never when none is configured', () => {
    const env = { KLAROS_PROVISIONING_SECRET: SECRET };
    expect(secretMatches(SECRET, env)).toBe(true);
    expect(secretMatches(SECRET + 'x', env)).toBe(false);
    expect(secretMatches('b'.repeat(40), env)).toBe(false);
    expect(secretMatches('', env)).toBe(false);
    expect(secretMatches(undefined, env)).toBe(false);
    expect(secretMatches(SECRET, {})).toBe(false);
    expect(secretMatches('', {})).toBe(false);
  });

  it('reads a Bearer header and nothing else', () => {
    expect(bearerFrom(`Bearer ${SECRET}`)).toBe(SECRET);
    expect(bearerFrom(`bearer ${SECRET}`)).toBe(SECRET);
    expect(bearerFrom(SECRET)).toBeUndefined();
    expect(bearerFrom('Bearer a b')).toBeUndefined();
    expect(bearerFrom(undefined)).toBeUndefined();
  });
});

describe('the request body', () => {
  it('accepts a well-formed request and normalises it', () => {
    const out = validateProvisionInput(good({ klarosTenantId: TENANT.toUpperCase(), businessName: '  Atlas Care  ', webhookUrl: `https://klaros.example.com/api/v1/webhooks/halla/${TENANT.toUpperCase()}` }));
    expect(out).toMatchObject({ klarosTenantId: TENANT, businessName: 'Atlas Care', vertical: 'medical_tourism', rotate: false });
  });

  it('rotate is only ever true when it is exactly true', () => {
    expect(validateProvisionInput(good({ rotate: true })).rotate).toBe(true);
    expect(validateProvisionInput(good({ rotate: 'true' })).rotate).toBe(false);
  });

  it('refuses a missing body, a bad id, a bad name', () => {
    rejects(undefined, /klarosTenantId/);
    rejects(good({ klarosTenantId: 'not-a-uuid' }), /UUID/);
    rejects(good({ businessName: 'A' }), /businessName/);
    rejects(good({ businessName: 'x'.repeat(121) }), /businessName/);
    rejects(good({ businessName: 'Bad\u0000Name' }), /businessName/);
  });

  it('only provisions a business type that is listed, and that has a template', () => {
    expect(PROVISIONABLE_VERTICALS).toEqual(['medical_tourism']);
    for (const v of PROVISIONABLE_VERTICALS) expect(v in WORKFORCE_TEMPLATES).toBe(true);
    rejects(good({ vertical: 'dropshipping' }), /cannot be provisioned/);
    rejects(good({ vertical: '__proto__' }), /cannot be provisioned/);
    rejects(good({ vertical: undefined }), /cannot be provisioned/);
  });

  it('the webhook address must be this business\'s own https Klaros address, with nothing smuggled in it', () => {
    rejects(good({ webhookUrl: 'not a url' }), /absolute URL/);
    rejects(good({ webhookUrl: `http://klaros.example.com/api/v1/webhooks/halla/${TENANT}` }), /https/);
    rejects(good({ webhookUrl: `https://user:pw@klaros.example.com/api/v1/webhooks/halla/${TENANT}` }), /https/);
    rejects(good({ webhookUrl: `https://klaros.example.com/api/v1/webhooks/halla/${TENANT}?x=1` }), /https/);
    rejects(good({ webhookUrl: `https://klaros.example.com/api/v1/webhooks/halla/${TENANT}#f` }), /https/);
    // another business's address, or an unrelated endpoint, cannot be registered
    rejects(good({ webhookUrl: 'https://klaros.example.com/api/v1/webhooks/halla/11111111-1111-4111-8111-111111111111' }), /this business/);
    rejects(good({ webhookUrl: 'https://evil.example.com/collect' }), /this business/);
  });
});

describe('what Klaros is given', () => {
  it('every scope on the key is one a route actually accepts, and none is the webhook-management scope', () => {
    const known = new Set(API_KEY_ROUTE_POLICY.map((p) => p.scope));
    for (const s of KLAROS_KEY_SCOPES) expect(known.has(s)).toBe(true);
    expect(KLAROS_KEY_SCOPES).not.toContain('webhooks.manage');
  });

  it('the webhook subscribes only to events in the Klaros contract', () => {
    for (const e of KLAROS_WEBHOOK_EVENTS) expect((KLAROS_EVENT_TYPES as readonly string[]).includes(e)).toBe(true);
  });
});
