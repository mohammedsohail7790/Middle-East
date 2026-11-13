import { describe, expect, it } from 'vitest';
import { signLink, verifyLink, type LinkKind } from '../../../apps/gateway/src/services/audit/signed-link.js';

const secret = 'unit-test-secret-unit-test-secret';
const payload = (k: LinkKind) => ({ k, id: '5f0e5c1c-0000-4000-8000-000000000001', company: 'Acme LLC', email: 'owner@acme.test', x: Math.floor(Date.now() / 1000) + 3600 });

describe('signed links for proposals and project status pages', () => {
  it.each(['proposal', 'project'] as const)('signs and verifies a %s link', (kind) => {
    const r = verifyLink(signLink(payload(kind), secret), secret);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.k).toBe(kind);
  });

  it('still verifies the five existing kinds', () => {
    for (const kind of ['form2', 'pay', 'approve', 'sendpay', 'review'] as const) expect(verifyLink(signLink(payload(kind), secret), secret).ok).toBe(true);
  });

  it('rejects a link signed with another secret, a changed body, an expired link and an unknown kind', () => {
    const good = signLink(payload('proposal'), secret);
    expect(verifyLink(good, 'another-secret-another-secret-123').ok).toBe(false);
    const [body, sig] = good.split('.');
    const tampered = Buffer.from(JSON.stringify({ ...payload('proposal'), id: 'someone-elses-proposal' })).toString('base64url');
    expect(verifyLink(`${tampered}.${sig}`, secret).ok).toBe(false);
    expect(body).toBeTruthy();
    expect(verifyLink(signLink({ ...payload('project'), x: Math.floor(Date.now() / 1000) - 10 }, secret), secret)).toEqual({ ok: false, reason: 'expired' });
    expect(verifyLink(signLink({ ...payload('review'), k: 'admin' as LinkKind }, secret), secret)).toEqual({ ok: false, reason: 'malformed' });
  });
});
