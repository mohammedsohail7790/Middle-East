import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signLink, verifyLink, type LinkPayload } from '../../apps/gateway/src/services/audit/signed-link.js';
import { approveUrl, firstName, paymentUrl, questionnaireUrl } from '../../apps/gateway/src/services/audit/audit-links.js';

const SECRET = 'test-secret-for-audit-links';
const tokenOf = (url: string | null): string => decodeURIComponent(new URL(url as string).searchParams.get('t') as string);

describe('audit links in the live flow', () => {
  const saved = process.env.AUDIT_LINK_SECRET;
  beforeEach(() => { process.env.AUDIT_LINK_SECRET = SECRET; });
  afterEach(() => { if (saved === undefined) delete process.env.AUDIT_LINK_SECRET; else process.env.AUDIT_LINK_SECRET = saved; });

  it('signs and verifies the approve kind, carrying the currency and the first name', () => {
    const payload: LinkPayload = { k: 'approve', id: 'abc12345', company: 'Smith & Co', email: 'jo@smith.com', x: Math.floor(Date.now() / 1000) + 3600, cur: 'AED', name: 'Jo' };
    const r = verifyLink(signLink(payload, SECRET), SECRET);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload).toMatchObject({ k: 'approve', cur: 'AED', name: 'Jo', company: 'Smith & Co' });
  });

  it('rejects a changed or expired approve link', () => {
    const good = signLink({ k: 'approve', id: 'x1', company: 'A', email: 'a@a.com', x: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
    const [body, sig] = good.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), company: 'Other' })).toString('base64url');
    expect(verifyLink(`${forged}.${sig}`, SECRET).ok).toBe(false);
    const expired = signLink({ k: 'approve', id: 'x2', company: 'A', email: 'a@a.com', x: Math.floor(Date.now() / 1000) - 10 }, SECRET);
    const e = verifyLink(expired, SECRET);
    expect(e.ok).toBe(false);
  });

  it('makes the three links on the right addresses and with the right kinds', () => {
    const who = { company: 'Smith & Co', email: 'jo@smith.com', name: 'Jo', cur: 'SAR' };
    const a = approveUrl(who) as string;
    expect(a).toContain('/api/v1/public/audit/approve?t=');
    const q = questionnaireUrl(who) as string;
    expect(q).toMatch(/\/audit\?t=/);
    const p = paymentUrl(who) as string;
    expect(p).toMatch(/\/audit\/pay\?t=/);
    const kinds = [a, q, p].map((u) => { const r = verifyLink(tokenOf(u), SECRET); return r.ok ? r.payload.k : 'bad'; });
    expect(kinds).toEqual(['approve', 'form2', 'pay']);
    const pay = verifyLink(tokenOf(p), SECRET);
    if (pay.ok) expect(pay.payload.cur).toBe('SAR');
  });

  it('keeps the same reference id from the questionnaire to the payment link', () => {
    const q = verifyLink(tokenOf(questionnaireUrl({ id: 'ref00001', company: 'A', email: 'a@a.com' })), SECRET);
    const p = verifyLink(tokenOf(paymentUrl({ id: 'ref00001', company: 'A', email: 'a@a.com', cur: 'AED' })), SECRET);
    expect(q.ok && p.ok && q.payload.id === p.payload.id).toBe(true);
  });

  it('drops a currency the audit does not price', () => {
    const r = verifyLink(tokenOf(approveUrl({ company: 'A', email: 'a@a.com', cur: 'USD' })), SECRET);
    expect(r.ok && r.payload.cur === undefined).toBe(true);
  });

  it('makes no link without the secret, so the flow falls back to the manual way', () => {
    delete process.env.AUDIT_LINK_SECRET;
    expect(approveUrl({ company: 'A', email: 'a@a.com' })).toBeNull();
    expect(paymentUrl({ company: 'A', email: 'a@a.com', cur: 'AED' })).toBeNull();
  });

  it('takes only the first name', () => {
    expect(firstName('  Jordan  Lee ')).toBe('Jordan');
    expect(firstName('')).toBeUndefined();
  });
});
