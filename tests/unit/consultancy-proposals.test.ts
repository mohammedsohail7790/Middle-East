import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();
vi.mock('resend', () => ({ Resend: class { emails = { send }; } }));

const secret = 'test-secret-at-least-long-enough';
const LEAD = '11111111-1111-4111-8111-111111111111';
const PID = '22222222-2222-4222-8222-222222222222';

/** An in-memory stand-in for the database: it recognises each statement the proposal store runs. */
function fakePool() {
  const rows = new Map<string, any>();
  let n = 0;
  const lead = { id: LEAD, company: 'Acme <b>Co</b>', contact_name: 'Sara Ali', email: 'sara@example.com' };
  const q = async (sql: string, p: any[] = []) => {
    const s = sql.replace(/\s+/g, ' ');
    const now = new Date();
    if (/FROM consultancy_leads/.test(s)) return { rows: p[0] === LEAD ? [lead] : [] };
    if (/SET status = 'expired'/.test(s)) {
      for (const r of rows.values()) if (r.status === 'sent' && new Date(r.valid_until) <= now && (!p[0] || p[0] === r.id)) r.status = 'expired';
      return { rows: [] };
    }
    if (/^INSERT INTO consultancy_proposals/.test(s)) {
      const id = n++ === 0 ? PID : `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`;
      const r = { id, lead_id: p[0], title: p[1], scope: p[2], items: JSON.parse(p[3]), currency: p[4], total_minor: String(p[5]), delivery_weeks: p[6], valid_until: p[7], language: p[8], status: 'draft', sent_at: null, accepted_at: null, accepted_name: null, accepted_ip: null, accepted_user_agent: null, terms_hash: null, declined_reason: null, created_by: p[9], created_at: now, updated_at: now };
      rows.set(id, r);
      return { rows: [{ ...r }] };
    }
    if (/^SELECT \* FROM consultancy_proposals WHERE id = \$1/.test(s)) return { rows: rows.has(p[0]) ? [{ ...rows.get(p[0]) }] : [] };
    if (/^SELECT \* FROM consultancy_proposals WHERE \(\$1/.test(s)) return { rows: [...rows.values()].filter((r) => (!p[0] || r.lead_id === p[0]) && (!p[1] || r.status === p[1])).map((r) => ({ ...r })) };
    const r = rows.get(p[0]);
    const upd = (cond: boolean, fn: () => void) => { if (!r || !cond) return { rows: [] }; fn(); return { rows: [{ ...r }] }; };
    if (/SET title = \$2/.test(s)) return upd(r?.status === 'draft', () => Object.assign(r, { title: p[1], scope: p[2], items: JSON.parse(p[3]), currency: p[4], total_minor: String(p[5]), delivery_weeks: p[6], valid_until: p[7], language: p[8] }));
    if (/SET status = 'sent'/.test(s)) return upd(r?.status === 'draft' && new Date(r.valid_until) > now, () => Object.assign(r, { status: 'sent', sent_at: now }));
    if (/SET status = 'draft'/.test(s)) return upd(r?.status === 'sent', () => Object.assign(r, { status: 'draft', sent_at: null }));
    if (/SET status = 'withdrawn'/.test(s)) return upd(['draft', 'sent'].includes(r?.status), () => (r.status = 'withdrawn'));
    if (/SET status = 'accepted'/.test(s)) return upd(r?.status === 'sent' && new Date(r.valid_until) > now, () => Object.assign(r, { status: 'accepted', accepted_at: now, accepted_name: p[1], accepted_ip: p[2], accepted_user_agent: p[3], terms_hash: p[4] }));
    if (/SET status = 'declined'/.test(s)) return upd(r?.status === 'sent' && new Date(r.valid_until) > now, () => Object.assign(r, { status: 'declined', declined_reason: p[1] }));
    throw new Error(`fake pool: unknown statement ${s}`);
  };
  return { query: vi.fn(q), rows };
}

let server: Server;
let base: string;
let pool: ReturnType<typeof fakePool>;
let sign: (p: any, s: string) => string;

const item = { title: 'Lead capture bot', priceMinor: 800000 };
const exp = (days = 30) => Math.floor(Date.now() / 1000) + days * 86400;
const tok = (over: any = {}) => sign({ k: 'proposal', id: PID, company: 'Acme', email: 'sara@example.com', x: exp(), ...over }, secret);
const json = (path: string, method: string, body?: unknown) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
const team = (path: string, method = 'GET', body?: unknown) => json(`/team${path}`, method, body);
const pub = (path: string, method = 'GET', body?: unknown) => json(`/pub${path}`, method, body);

beforeEach(async () => {
  vi.resetModules();
  send.mockReset();
  send.mockResolvedValue({ id: 'x' });
  process.env.RESEND_API_KEY = 'k';
  process.env.AUDIT_LEAD_EMAILS = 'team@example.com';
  process.env.AUDIT_LINK_SECRET = secret;
  sign = (await import('../../apps/gateway/src/services/audit/signed-link.js')).signLink;
  pool = fakePool();
  const { createProposalsRouter } = await import('../../apps/gateway/src/services/consultancy/consultancy-proposals.router.js');
  const { createPublicProposalRouter } = await import('../../apps/gateway/src/services/consultancy/public-proposal.router.js');
  const app = express();
  app.use('/team', createProposalsRouter({ pool: pool as any }));
  app.use('/pub', createPublicProposalRouter({ pool: pool as any }));
  await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => { await new Promise((r) => server.close(r)); });

const create = async (over: any = {}) => (await (await team('/', 'POST', { leadId: LEAD, title: 'Build', scope: 'Scope text', items: [item, { title: 'Dashboard', priceMinor: 500000 }], currency: 'AED', deliveryWeeks: 6, ...over })).json());
const createAndSend = async (over: any = {}) => {
  await create(over);
  const r = await (await team(`/${PID}/send`, 'POST')).json();
  return r;
};
const accept = (body: any) => pub('/accept', 'POST', body);

describe('create and validate', () => {
  it('creates a draft with the total and a 30 day validity', async () => {
    const j = await create();
    expect(j.data.status).toBe('draft');
    expect(j.data.total_minor).toBe(1300000);
    const days = (new Date(j.data.valid_until).getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
  });
  it.each([
    ['no items', { items: [] }],
    ['zero price', { items: [{ title: 'x', priceMinor: 0 }] }],
    ['negative price', { items: [{ title: 'x', priceMinor: -5 }] }],
    ['untitled item', { items: [{ title: ' ', priceMinor: 5 }] }],
    ['unknown currency', { currency: 'USD' }],
    ['absurd total', { items: [{ title: 'x', priceMinor: 9e12 }] }],
    ['bad language', { language: 'fr' }],
    ['past validity', { validUntil: '2020-01-01' }],
  ])('refuses %s', async (_n, over) => {
    const res = await team('/', 'POST', { leadId: LEAD, title: 'T', items: [item], ...over });
    expect(res.status).toBe(400);
  });
  it('404s an unknown lead and edits only drafts', async () => {
    expect((await team('/', 'POST', { leadId: '99999999-9999-4999-8999-999999999999', title: 'T', items: [item] })).status).toBe(404);
    await create();
    const edited = await (await team(`/${PID}`, 'PATCH', { title: 'New title', items: [{ title: 'Only', priceMinor: 900000 }] })).json();
    expect(edited.data.title).toBe('New title');
    expect(edited.data.total_minor).toBe(900000);
    await team(`/${PID}/send`, 'POST');
    expect((await team(`/${PID}`, 'PATCH', { title: 'Nope' })).status).toBe(409);
  });
  it('lists with filters', async () => {
    await create();
    expect((await (await team(`/?leadId=${LEAD}&status=draft`)).json()).data).toHaveLength(1);
    expect((await (await team(`/?status=sent`)).json()).data).toHaveLength(0);
    expect((await team(`/?status=bogus`)).status).toBe(400);
  });
});

describe('send', () => {
  it('signs a proposal link, emails the client in the proposal language and returns the link', async () => {
    const r = await createAndSend({ language: 'ar' });
    expect(r.data.proposal.status).toBe('sent');
    expect(r.data.emailed).toBe(true);
    const t = new URL(r.data.link).searchParams.get('t')!;
    const { verifyLink } = await import('../../apps/gateway/src/services/audit/signed-link.js');
    const v: any = verifyLink(t, secret);
    expect(v.ok).toBe(true);
    expect(v.payload.k).toBe('proposal');
    expect(v.payload.id).toBe(PID);
    const mail = send.mock.calls[0][0];
    expect(mail.to).toEqual(['sara@example.com']);
    expect(mail.html).toContain('dir="rtl"');
    expect(mail.subject).toContain('عرض');
  });
  it('refuses to send twice, and keeps a draft when the email fails', async () => {
    send.mockRejectedValueOnce(new Error('smtp down'));
    await create();
    const failed = await team(`/${PID}/send`, 'POST');
    expect(failed.status).toBe(502);
    expect((await (await team(`/${PID}`)).json()).data.status).toBe('draft');
    expect((await team(`/${PID}/send`, 'POST')).status).toBe(200);
    expect((await team(`/${PID}/send`, 'POST')).status).toBe(409);
  });
  it('needs the signing secret', async () => {
    await create();
    delete process.env.AUDIT_LINK_SECRET;
    expect((await team(`/${PID}/send`, 'POST')).status).toBe(503);
  });
});

describe('accept', () => {
  it('records the evidence, emails the team and the client, and returns the fingerprint', async () => {
    const r = await createAndSend();
    send.mockClear();
    const res = await accept({ t: new URL(r.data.link).searchParams.get('t'), name: 'Sara Ali', agree: true });
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.data.alreadyAccepted).toBe(false);
    expect(j.data.termsHash).toMatch(/^[0-9a-f]{64}$/);
    const row = pool.rows.get(PID);
    expect(row.status).toBe('accepted');
    expect(row.accepted_name).toBe('Sara Ali');
    expect(row.accepted_user_agent).toBeTruthy();
    expect(row.accepted_ip).toBeTruthy();
    const recipients = send.mock.calls.map((c) => c[0].to[0]).sort();
    expect(recipients).toEqual(['sara@example.com', 'team@example.com']);
  });
  it('is idempotent: a second and a simultaneous accept return the first acceptance, with one set of emails', async () => {
    await createAndSend();
    send.mockClear();
    const body = { t: tok(), name: 'Sara Ali', agree: true };
    const [a, b] = await Promise.all([accept(body), accept(body)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const again = await (await accept({ ...body, name: 'Someone Else' })).json();
    expect(again.data.alreadyAccepted).toBe(true);
    expect(again.data.acceptedName).toBe('Sara Ali');
    expect(pool.rows.get(PID).accepted_name).toBe('Sara Ali');
    expect(send).toHaveBeenCalledTimes(2);
  });
  it('needs a typed name and the checkbox', async () => {
    await createAndSend();
    expect((await accept({ t: tok(), name: '', agree: true })).status).toBe(400);
    expect((await accept({ t: tok(), name: 'Sara Ali', agree: false })).status).toBe(400);
    expect(pool.rows.get(PID).status).toBe('sent');
  });
  it('refuses when the terms changed since the page was shown', async () => {
    await createAndSend();
    expect((await accept({ t: tok(), name: 'Sara Ali', agree: true, terms: 'a'.repeat(64) })).status).toBe(409);
  });
  it('refuses an expired proposal', async () => {
    await createAndSend();
    pool.rows.get(PID).valid_until = new Date(Date.now() - 1000).toISOString();
    const res = await accept({ t: tok(), name: 'Sara Ali', agree: true });
    expect(res.status).toBe(410);
    expect(pool.rows.get(PID).status).toBe('expired');
  });
  it('refuses a withdrawn proposal', async () => {
    await createAndSend();
    expect((await team(`/${PID}/withdraw`, 'POST')).status).toBe(200);
    const res = await accept({ t: tok(), name: 'Sara Ali', agree: true });
    expect(res.status).toBe(409);
    expect(pool.rows.get(PID).status).toBe('withdrawn');
  });
  it('cannot withdraw an accepted proposal', async () => {
    await createAndSend();
    await accept({ t: tok(), name: 'Sara Ali', agree: true });
    expect((await team(`/${PID}/withdraw`, 'POST')).status).toBe(409);
  });
});

describe('links are always verified', () => {
  it('POST /accept without a valid link is refused and touches nothing', async () => {
    await createAndSend();
    pool.query.mockClear();
    for (const t of [undefined, '', 'x'.repeat(40), tok().slice(0, -3) + 'abc', tok({ k: 'pay' }), tok({ k: 'project' }), tok({ x: Math.floor(Date.now() / 1000) - 10 })]) {
      const res = await accept({ t, name: 'Sara Ali', agree: true });
      expect([400, 410]).toContain(res.status);
    }
    expect(pool.query).not.toHaveBeenCalled();
    expect(pool.rows.get(PID).status).toBe('sent');
  });
  it('declining and viewing also need a link, and an unknown id looks like a bad link', async () => {
    await createAndSend();
    expect((await pub('/decline', 'POST', { t: 'nope' })).status).toBe(400);
    expect((await fetch(`${base}/pub?t=nope`)).status).toBe(400);
    const unknown = tok({ id: '44444444-4444-4444-8444-444444444444' });
    const a = await fetch(`${base}/pub?t=${unknown}`);
    const b = await fetch(`${base}/pub?t=nope`);
    expect(a.status).toBe(b.status);
    expect(await a.text()).toBe(await b.text());
  });
});

describe('decline', () => {
  it('records an optional reason, and an accepted proposal cannot be declined', async () => {
    await createAndSend();
    const res = await pub('/decline', 'POST', { t: tok(), reason: 'Too expensive' });
    expect((await res.json()).data.status).toBe('declined');
    expect(pool.rows.get(PID).declined_reason).toBe('Too expensive');
    expect((await accept({ t: tok(), name: 'Sara Ali', agree: true })).status).toBe(409);
  });
  it('refuses to decline after acceptance', async () => {
    await createAndSend();
    await accept({ t: tok(), name: 'Sara Ali', agree: true });
    expect((await pub('/decline', 'POST', { t: tok() })).status).toBe(409);
  });
});

describe('the client page', () => {
  it('escapes stored text and the typed name', async () => {
    await createAndSend({ title: '<script>alert(1)</script>', scope: '<img src=x onerror=alert(2)>', items: [{ title: '"><svg onload=1>', priceMinor: 800000 }] });
    const html = await (await fetch(`${base}/pub?t=${tok()}`)).text();
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<svg onload');
    expect(html).toContain('&lt;script&gt;');
    await accept({ t: tok(), name: '<b onclick=x>Evil</b>', agree: true });
    const after = await (await fetch(`${base}/pub?t=${tok()}`)).text();
    expect(after).not.toContain('<b onclick');
    expect(after).toContain('&lt;b onclick=x&gt;');
  });
  it('shows terms, the form and the AED price in English', async () => {
    await createAndSend();
    const html = await (await fetch(`${base}/pub?t=${tok()}`)).text();
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('AED 13,000');
    expect(html).toContain('6 weeks');
    expect(html).toContain('I accept this price and scope in writing');
    expect(html).toContain('type="checkbox"');
  });
  it('renders Arabic right to left', async () => {
    await createAndSend({ language: 'ar' });
    const html = await (await fetch(`${base}/pub?t=${tok()}`)).text();
    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect(html).toContain('أوافق كتابياً');
  });
  it('shows a clear message for each state', async () => {
    await createAndSend();
    const get = async () => (await fetch(`${base}/pub?t=${tok()}`)).text();
    pool.rows.get(PID).status = 'withdrawn';
    expect(await get()).toContain('Proposal withdrawn');
    pool.rows.get(PID).status = 'declined';
    expect(await get()).toContain('Proposal declined');
    pool.rows.get(PID).status = 'accepted';
    pool.rows.get(PID).accepted_name = 'Sara';
    pool.rows.get(PID).accepted_at = new Date();
    expect(await get()).toContain('Proposal accepted');
    pool.rows.get(PID).status = 'sent';
    pool.rows.get(PID).valid_until = new Date(Date.now() - 1000).toISOString();
    const res = await fetch(`${base}/pub?t=${tok()}`);
    expect(await res.text()).toContain('Proposal expired');
  });
});

describe('terms fingerprint', () => {
  it('is stable for the same terms and changes when any term changes', async () => {
    const { termsHash } = await import('../../apps/gateway/src/services/consultancy/proposal-store.js');
    const base0: any = { title: 'T', scope: 'S', items: [{ title: 'a', priceMinor: 5 }], total_minor: 5, currency: 'AED', delivery_weeks: 4, valid_until: '2030-01-01T00:00:00.000Z' };
    const h = termsHash(base0);
    expect(termsHash({ ...base0, valid_until: new Date('2030-01-01T00:00:00Z') })).toBe(h);
    expect(termsHash({ ...base0, scope: 'S2' })).not.toBe(h);
    expect(termsHash({ ...base0, total_minor: 6 })).not.toBe(h);
  });
});

describe('copy the client link again', () => {
  it('gives a working link for a sent proposal and refuses a draft', async () => {
    await create();
    expect((await team(`/${PID}/link`)).status).toBe(409);
    await team(`/${PID}/send`, 'POST');
    const j = await (await team(`/${PID}/link`)).json();
    const res = await fetch(`${base}/pub?t=${new URL(j.data.link).searchParams.get('t')}`);
    expect(res.status).toBe(200);
  });
});
