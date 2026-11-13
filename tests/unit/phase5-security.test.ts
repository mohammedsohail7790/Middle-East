import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signOAuthState, verifyOAuthState } from '../../apps/gateway/src/services/calendar/oauth-state.js';
import { verifyCalendlyWebhookSignature } from '../../apps/gateway/src/services/calendar/calendly.webhook.js';
import { storablePayload } from '../../apps/gateway/src/services/automation-engine/store.js';

const TENANT = '11111111-2222-3333-4444-555555555555';

describe('calendar connect state', () => {
  const saved = process.env.JWT_SECRET;
  beforeEach(() => { process.env.JWT_SECRET = 'test-secret-for-state'; });
  afterEach(() => { process.env.JWT_SECRET = saved; });

  it('round-trips a signed state', () => {
    expect(verifyOAuthState(signOAuthState(TENANT))).toBe(TENANT);
  });
  it('rejects the old unsigned kinds (a bare id and base64 JSON)', () => {
    expect(verifyOAuthState(TENANT)).toBeNull();
    expect(verifyOAuthState(Buffer.from(JSON.stringify({ tenantId: TENANT })).toString('base64url'))).toBeNull();
  });
  it('rejects a state with a changed workspace id', () => {
    const [body, sig] = signOAuthState(TENANT).split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), t: 'victim' })).toString('base64url');
    expect(verifyOAuthState(`${forged}.${sig}`)).toBeNull();
  });
  it('rejects an expired state and one signed with another secret', () => {
    const t0 = Date.now();
    const s = signOAuthState(TENANT, t0);
    expect(verifyOAuthState(s, t0 + 9 * 60_000)).toBe(TENANT);
    expect(verifyOAuthState(s, t0 + 11 * 60_000)).toBeNull();
    process.env.JWT_SECRET = 'a-different-secret';
    expect(verifyOAuthState(s, t0)).toBeNull();
  });
  it('rejects empty and junk input', () => {
    for (const v of [undefined, null, '', 'abc', 'a.b', 42, 'x'.repeat(2000)]) expect(verifyOAuthState(v)).toBeNull();
  });
});

describe('Calendly webhook signature', () => {
  const saved = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
  afterEach(() => { process.env.CALENDLY_WEBHOOK_SIGNING_KEY = saved; if (saved === undefined) delete process.env.CALENDLY_WEBHOOK_SIGNING_KEY; });
  const body = Buffer.from('{"event":"invitee.created"}');
  const header = (key: string, t: number) => `t=${t},v1=${createHmac('sha256', key).update(`${t}.`).update(body).digest('hex')}`;

  it('refuses everything when no key is set', () => {
    delete process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
    expect(verifyCalendlyWebhookSignature(body, header('k', Math.floor(Date.now() / 1000)))).toBe(false);
  });
  it('accepts a fresh correct signature and rejects wrong, missing and replayed ones', () => {
    process.env.CALENDLY_WEBHOOK_SIGNING_KEY = 'k';
    const now = Math.floor(Date.now() / 1000);
    expect(verifyCalendlyWebhookSignature(body, header('k', now))).toBe(true);
    expect(verifyCalendlyWebhookSignature(body, header('other', now))).toBe(false);
    expect(verifyCalendlyWebhookSignature(body, undefined)).toBe(false);
    expect(verifyCalendlyWebhookSignature(body, header('k', now - 3600))).toBe(false);
  });
});

describe('documents are not kept in the run log', () => {
  it('drops the text and the photo and says so, keeping the rest', () => {
    const out = storablePayload({ fileName: 'a.pdf', ref: 'abc', text: 'secret contract', imageDataUrl: 'data:image/png;base64,AAAA' });
    expect(out).toEqual({ fileName: 'a.pdf', ref: 'abc', documentNotKept: true });
  });
  it('leaves other payloads untouched', () => {
    expect(storablePayload({ leadName: 'Sam', score: 80 })).toEqual({ leadName: 'Sam', score: 80 });
  });
});
