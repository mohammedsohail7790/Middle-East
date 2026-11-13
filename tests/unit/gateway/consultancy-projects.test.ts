import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { signLink } from '../../../apps/gateway/src/services/audit/signed-link.js';
import { createProjectsRouter } from '../../../apps/gateway/src/services/consultancy/consultancy-projects.router.js';
import { createPublicProjectRouter } from '../../../apps/gateway/src/services/consultancy/public-project.router.js';
import {
  ProjectError, addDays, computeDeliveryDate, createProjectFromProposal, getProject, isOverdue, listProjects, reorderMilestones, updateProject, addMilestone, updateMilestone, warrantyEndsOn,
} from '../../../apps/gateway/src/services/consultancy/project-store.js';

const L1 = '11111111-1111-4111-8111-111111111111';
const P1 = '22222222-2222-4222-8222-222222222222';
const P2 = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-03-10T12:00:00Z');

/** An in-memory stand-in for the pool: understands exactly the statements project-store.ts sends. */
function fakePool() {
  const db = {
    leads: [{ id: L1, company: 'Acme <Co>', email: 'client@acme.test', contact_name: 'Sara Ali' }] as any[],
    proposals: [
      { id: P1, lead_id: L1, title: 'CRM build', status: 'accepted', delivery_weeks: 4, language: 'en' },
      { id: P2, lead_id: L1, title: 'Draft thing', status: 'sent', delivery_weeks: 2, language: 'ar' },
    ] as any[],
    projects: [] as any[],
    milestones: [] as any[],
    seq: 0,
  };
  const uuid = () => `00000000-0000-4000-8000-${String(++db.seq).padStart(12, '0')}`;
  const q = vi.fn(async (sql: string, p: unknown[] = []) => {
    const s = sql.replace(/\s+/g, ' ');
    const rows = (r: any[]) => ({ rows: r });
    if (s.startsWith('SELECT id FROM consultancy_leads')) return rows(db.leads.filter((l) => l.id === p[0]).map((l) => ({ id: l.id })));
    if (s.startsWith('SELECT id, lead_id, title, status, delivery_weeks FROM consultancy_proposals')) return rows(db.proposals.filter((x) => x.id === p[0]));
    if (s.startsWith('SELECT id FROM consultancy_projects WHERE proposal_id')) return rows(db.projects.filter((x) => x.proposal_id === p[0]).map((x) => ({ id: x.id })));
    if (s.startsWith('SELECT id FROM consultancy_projects WHERE id')) return rows(db.projects.filter((x) => x.id === p[0]).map((x) => ({ id: x.id })));
    if (s.startsWith('INSERT INTO consultancy_projects (proposal_id')) {
      if (db.projects.some((x) => x.proposal_id === p[0])) return rows([]);
      const row = { id: uuid(), proposal_id: p[0], lead_id: p[1], name: p[2], status: 'planned', starts_on: p[3], delivery_date: p[4], delivered_at: null, handover: { code: false, data: false, accounts: false, documentation: false }, client_notes: null, created_at: NOW, updated_at: NOW };
      db.projects.push(row);
      return rows([{ id: row.id }]);
    }
    if (s.startsWith('INSERT INTO consultancy_projects (lead_id')) {
      const row = { id: uuid(), proposal_id: null, lead_id: p[0], name: p[1], status: 'planned', starts_on: p[2], delivery_date: p[3], delivered_at: null, handover: { code: false, data: false, accounts: false, documentation: false }, client_notes: p[4], created_at: NOW, updated_at: NOW };
      db.projects.push(row);
      return rows([{ id: row.id }]);
    }
    if (s.includes('milestone_total')) {
      return rows(db.projects.map((x) => ({ ...x, company: db.leads[0].company, milestone_total: db.milestones.filter((m) => m.project_id === x.id).length, milestone_done: db.milestones.filter((m) => m.project_id === x.id && m.done_at).length })));
    }
    if (s.includes('FROM consultancy_projects p LEFT JOIN consultancy_leads c ON c.id = p.lead_id WHERE p.id')) return rows(db.projects.filter((x) => x.id === p[0]).map((x) => ({ ...x, company: db.leads[0].company })));
    if (s.includes('pr.language') && s.includes('c.email')) {
      return rows(db.projects.filter((x) => x.id === p[0]).map((x) => ({ name: x.name, company: db.leads[0].company, email: db.leads[0].email, contact_name: db.leads[0].contact_name, language: db.proposals.find((r) => r.id === x.proposal_id)?.language ?? null })));
    }
    if (s.includes('pr.language')) {
      return rows(db.projects.filter((x) => x.id === p[0]).map((x) => ({ ...x, language: db.proposals.find((r) => r.id === x.proposal_id)?.language ?? null })));
    }
    if (s.startsWith('SELECT link_version FROM consultancy_projects')) return rows(db.projects.filter((x) => x.id === p[0]).map((x) => ({ link_version: x.link_version ?? 1 })));
    if (s.startsWith('UPDATE consultancy_projects SET link_version')) {
      const x = db.projects.find((r) => r.id === p[0]);
      if (!x) return rows([]);
      x.link_version = (x.link_version ?? 1) + 1;
      return rows([{ link_version: x.link_version }]);
    }
    if (s.startsWith('SELECT COALESCE(MAX(position)')) return rows([{ next: Math.max(-1, ...db.milestones.filter((m) => m.project_id === p[0]).map((m) => m.position)) + 1 }]);
    if (s.startsWith('INSERT INTO consultancy_milestones')) {
      const row = { id: uuid(), project_id: p[0], title: p[1], due_on: p[2], note: p[3], position: p[4], done_at: p[5] };
      db.milestones.push(row);
      return rows([{ id: row.id }]);
    }
    if (s.startsWith('SELECT id FROM consultancy_milestones WHERE project_id')) return rows(db.milestones.filter((m) => m.project_id === p[0]).map((m) => ({ id: m.id })));
    if (s.includes('FROM consultancy_milestones m WHERE m.id')) return rows(db.milestones.filter((m) => m.id === p[0] && m.project_id === p[1]));
    if (s.includes('FROM consultancy_milestones m WHERE m.project_id')) return rows(db.milestones.filter((m) => m.project_id === p[0]).sort((a, b) => a.position - b.position));
    if (s.startsWith('UPDATE consultancy_milestones SET position')) {
      const m = db.milestones.find((x) => x.id === p[1] && x.project_id === p[2]);
      if (m) m.position = p[0];
      return rows([]);
    }
    const upd = /^UPDATE (consultancy_projects|consultancy_milestones) SET (.*) WHERE/.exec(s);
    if (upd) {
      const table = upd[1] === 'consultancy_projects' ? db.projects : db.milestones;
      const target = table.find((x) => (upd[1] === 'consultancy_projects' ? x.id === p[p.length - 1] : x.id === p[p.length - 2]));
      for (const part of upd[2].split(', ')) {
        const m = /^(\w+) = \$(\d+)/.exec(part)!;
        let v = p[Number(m[2]) - 1];
        if (m[1] === 'handover') v = JSON.parse(v as string);
        target[m[1]] = v;
      }
      return rows([]);
    }
    if (s.startsWith('DELETE FROM consultancy_milestones')) {
      const i = db.milestones.findIndex((m) => m.id === p[0] && m.project_id === p[1]);
      if (i < 0) return rows([]);
      db.milestones.splice(i, 1);
      return rows([{ id: p[0] }]);
    }
    if (s.includes("pr.status = 'accepted'")) return rows(db.proposals.filter((x) => x.status === 'accepted').map((x) => ({ id: x.id, title: x.title, company: db.leads[0].company, has_project: db.projects.some((pr) => pr.proposal_id === x.id) })));
    throw new Error(`fake pool: unhandled SQL ${s}`);
  });
  return { db, pool: { query: q }, q };
}

const ALL = { code: true, data: true, accounts: true, documentation: true };

describe('date maths', () => {
  it('adds days and weeks across month and leap-year edges', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2028-02-28', 2)).toBe('2028-03-01');
    expect(computeDeliveryDate('2026-03-10', 4)).toBe('2026-04-07');
    expect(computeDeliveryDate('2026-03-10', null)).toBeNull();
    expect(computeDeliveryDate('2026-03-10', 0)).toBeNull();
  });
  it('warranty ends 30 days after delivery', () => {
    expect(warrantyEndsOn('2026-03-10T23:59:00Z')).toBe('2026-04-09');
    expect(warrantyEndsOn(null)).toBeNull();
  });
  it('overdue only after the date, and never for delivered or cancelled', () => {
    expect(isOverdue({ deliveryDate: '2026-03-09', status: 'in_progress' }, NOW)).toBe(true);
    expect(isOverdue({ deliveryDate: '2026-03-10', status: 'in_progress' }, NOW)).toBe(false);
    expect(isOverdue({ deliveryDate: '2026-03-09', status: 'delivered' }, NOW)).toBe(false);
    expect(isOverdue({ deliveryDate: '2026-03-09', status: 'cancelled' }, NOW)).toBe(false);
    expect(isOverdue({ deliveryDate: null, status: 'planned' }, NOW)).toBe(false);
  });
});

describe('create from proposal', () => {
  it('copies the title, links the proposal and sets start + weeks as delivery date', async () => {
    const { pool } = fakePool();
    const r = await createProjectFromProposal(pool, P1, { now: NOW });
    expect(r.created).toBe(true);
    expect(r.project.name).toBe('CRM build');
    expect(r.project.proposalId).toBe(P1);
    expect(r.project.startsOn).toBe('2026-03-10');
    expect(r.project.deliveryDate).toBe('2026-04-07');
  });
  it('uses a given start date', async () => {
    const { pool } = fakePool();
    const r = await createProjectFromProposal(pool, P1, { startsOn: '2026-06-01', now: NOW });
    expect(r.project.deliveryDate).toBe('2026-06-29');
  });
  it('refuses a proposal that is not accepted, and one that does not exist', async () => {
    const { pool, db } = fakePool();
    await expect(createProjectFromProposal(pool, P2, { now: NOW })).rejects.toMatchObject({ code: 'not_accepted' });
    await expect(createProjectFromProposal(pool, 'nope', { now: NOW })).rejects.toMatchObject({ code: 'not_found' });
    expect(db.projects).toHaveLength(0);
  });
  it('is idempotent: a second call returns the same project', async () => {
    const { pool, db } = fakePool();
    const a = await createProjectFromProposal(pool, P1, { now: NOW });
    const b = await createProjectFromProposal(pool, P1, { now: NOW });
    expect(b.created).toBe(false);
    expect(b.project.id).toBe(a.project.id);
    expect(db.projects).toHaveLength(1);
  });
  it('leaves the delivery date empty when the proposal has no weeks', async () => {
    const { pool, db } = fakePool();
    db.proposals[0].delivery_weeks = null;
    expect((await createProjectFromProposal(pool, P1, { now: NOW })).project.deliveryDate).toBeNull();
  });
});

describe('delivered needs the handover', () => {
  it('refuses delivered with an unticked handover, accepts it when ticked, stamps delivered_at and the warranty', async () => {
    const { pool } = fakePool();
    const { project } = await createProjectFromProposal(pool, P1, { now: NOW });
    await expect(updateProject(pool, project.id, { status: 'delivered' }, { now: NOW })).rejects.toMatchObject({ code: 'handover_incomplete' });
    await expect(updateProject(pool, project.id, { status: 'delivered', handover: { code: true, data: true, accounts: true } }, { now: NOW })).rejects.toMatchObject({ code: 'handover_incomplete' });
    const done = await updateProject(pool, project.id, { status: 'delivered', handover: ALL }, { now: NOW });
    expect(done.status).toBe('delivered');
    expect(done.deliveredAt).toBe(NOW.toISOString());
    expect(done.warrantyEndsOn).toBe('2026-04-09');
    expect(done.overdue).toBe(false);
  });
  it('force skips the check', async () => {
    const { pool } = fakePool();
    const { project } = await createProjectFromProposal(pool, P1, { now: NOW });
    const done = await updateProject(pool, project.id, { status: 'delivered' }, { force: true, now: NOW });
    expect(done.status).toBe('delivered');
    expect(done.deliveredAt).not.toBeNull();
  });
  it('clears delivered_at and the warranty when it moves back out of delivered', async () => {
    const { pool } = fakePool();
    const { project } = await createProjectFromProposal(pool, P1, { now: NOW });
    await updateProject(pool, project.id, { status: 'delivered' }, { force: true, now: NOW });
    const back = await updateProject(pool, project.id, { status: 'in_progress' }, { now: NOW });
    expect(back.deliveredAt).toBeNull();
    expect(back.warrantyEndsOn).toBeNull();
  });
  it('validates input', async () => {
    const { pool } = fakePool();
    const { project } = await createProjectFromProposal(pool, P1, { now: NOW });
    await expect(updateProject(pool, project.id, { status: 'bogus' })).rejects.toBeInstanceOf(ProjectError);
    await expect(updateProject(pool, project.id, { deliveryDate: '31/01/2026' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(updateProject(pool, project.id, { name: '  ' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(updateProject(pool, 'x', { name: 'a' })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('overdue and list', () => {
  it('computes overdue in the response and filters on it, with milestone counts', async () => {
    const { pool, db } = fakePool();
    const { project } = await createProjectFromProposal(pool, P1, { startsOn: '2026-01-01', now: NOW });
    const m1 = await addMilestone(pool, project.id, { title: 'Design' }, NOW);
    await addMilestone(pool, project.id, { title: 'Build' }, NOW);
    await updateMilestone(pool, project.id, m1.id, { done: true }, NOW);
    const all = await listProjects(pool, {}, NOW);
    expect(all[0]).toMatchObject({ overdue: true, milestoneTotal: 2, milestoneDone: 1 });
    expect(await listProjects(pool, { overdue: true }, NOW)).toHaveLength(1);
    db.projects[0].delivery_date = '2026-12-01';
    expect(await listProjects(pool, { overdue: true }, NOW)).toHaveLength(0);
  });
});

describe('milestones', () => {
  it('adds in order, ticks and unticks, and reorders', async () => {
    const { pool } = fakePool();
    const { project } = await createProjectFromProposal(pool, P1, { now: NOW });
    const a = await addMilestone(pool, project.id, { title: 'A' }, NOW);
    const b = await addMilestone(pool, project.id, { title: 'B' }, NOW);
    const c = await addMilestone(pool, project.id, { title: 'C' }, NOW);
    expect([a.position, b.position, c.position]).toEqual([0, 1, 2]);
    expect((await updateMilestone(pool, project.id, a.id, { done: true }, NOW)).done).toBe(true);
    expect((await updateMilestone(pool, project.id, a.id, { done: false }, NOW)).done).toBe(false);
    const ordered = await reorderMilestones(pool, project.id, [c.id, a.id, b.id]);
    expect(ordered.map((m) => m.title)).toEqual(['C', 'A', 'B']);
    expect((await getProject(pool, project.id))!.milestones.map((m) => m.title)).toEqual(['C', 'A', 'B']);
  });
  it('rejects a reorder that misses, repeats or adds an id', async () => {
    const { pool } = fakePool();
    const { project } = await createProjectFromProposal(pool, P1, { now: NOW });
    const a = await addMilestone(pool, project.id, { title: 'A' }, NOW);
    const b = await addMilestone(pool, project.id, { title: 'B' }, NOW);
    await expect(reorderMilestones(pool, project.id, [a.id])).rejects.toMatchObject({ code: 'invalid' });
    await expect(reorderMilestones(pool, project.id, [a.id, a.id])).rejects.toMatchObject({ code: 'invalid' });
    await expect(reorderMilestones(pool, project.id, [a.id, b.id, 'zzz'])).rejects.toMatchObject({ code: 'invalid' });
  });
  it('will not edit a milestone through another project', async () => {
    const { pool } = fakePool();
    const { project } = await createProjectFromProposal(pool, P1, { now: NOW });
    const a = await addMilestone(pool, project.id, { title: 'A' }, NOW);
    await expect(updateMilestone(pool, 'other', a.id, { title: 'x' })).rejects.toMatchObject({ code: 'not_found' });
  });
  it('uses parameters, never string-built values', async () => {
    const { pool, q } = fakePool();
    const { project } = await createProjectFromProposal(pool, P1, { now: NOW });
    await addMilestone(pool, project.id, { title: "x'); DROP TABLE consultancy_projects;--" }, NOW);
    for (const [sql] of q.mock.calls) expect(sql).not.toContain('DROP TABLE');
  });
});

// ---- HTTP: team router and public page ----

const SECRET = 'test-secret-for-project-links';
let server: import('node:http').Server;
let base: string;
const prevSecret = process.env.AUDIT_LINK_SECRET;

async function serve(mount: (app: express.Express) => void) {
  const app = express();
  app.use(express.json());
  mount(app);
  await new Promise<void>((r) => (server = app.listen(0, r)));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
beforeEach(() => {
  process.env.AUDIT_LINK_SECRET = SECRET;
});
afterEach(async () => {
  if (prevSecret === undefined) delete process.env.AUDIT_LINK_SECRET;
  else process.env.AUDIT_LINK_SECRET = prevSecret;
  if (server) {
    const s = server;
    server = undefined as unknown as typeof server;
    await new Promise((r) => {
      s.close(r);
      s.closeAllConnections?.();
    });
  }
});

const j = (method: string, path: string, body?: unknown) =>
  fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() as any }));

describe('team router', () => {
  it('create from proposal, repeat, accepted list, patch and not-accepted error', async () => {
    const { pool } = fakePool();
    await serve((app) => app.use('/p', createProjectsRouter({ pool, now: () => NOW })));
    const a = await j('POST', '/p', { proposalId: P1 });
    expect(a.status).toBe(201);
    expect(a.body.data.name).toBe('CRM build');
    expect((await j('POST', '/p', { proposalId: P1 })).status).toBe(200);
    expect((await j('POST', '/p', { proposalId: P2 })).status).toBe(409);
    const acc = await j('GET', '/p/accepted-proposals');
    expect(acc.body.data).toEqual([{ id: P1, title: 'CRM build', company: 'Acme <Co>', hasProject: true }]);
    const id = a.body.data.id;
    expect((await j('PATCH', `/p/${id}`, { status: 'delivered' })).status).toBe(409);
    expect((await j('PATCH', `/p/${id}`, { status: 'delivered', force: true })).body.data.status).toBe('delivered');
    expect((await j('GET', '/p/not-an-id')).status).toBe(404);
    expect((await j('GET', '/p?status=delivered')).status).toBe(200);
  });
  it('milestone routes including reorder', async () => {
    const { pool } = fakePool();
    await serve((app) => app.use('/p', createProjectsRouter({ pool, now: () => NOW })));
    const id = (await j('POST', '/p', { proposalId: P1 })).body.data.id;
    const a = (await j('POST', `/p/${id}/milestones`, { title: 'A' })).body.data;
    const b = (await j('POST', `/p/${id}/milestones`, { title: 'B' })).body.data;
    expect((await j('PATCH', `/p/${id}/milestones/${a.id}`, { done: true })).body.data.done).toBe(true);
    const re = await j('POST', `/p/${id}/milestones/reorder`, { order: [b.id, a.id] });
    expect(re.body.data.map((m: any) => m.title)).toEqual(['B', 'A']);
    expect((await j('DELETE', `/p/${id}/milestones/${a.id}`)).status).toBe(200);
    expect((await j('DELETE', `/p/${id}/milestones/${a.id}`)).status).toBe(404);
  });
  it('status link signs a project link valid 180 days and can email it', async () => {
    const { pool } = fakePool();
    const mail = vi.fn(async () => 'sent' as const);
    await serve((app) => app.use('/p', createProjectsRouter({ pool, mail, now: () => NOW })));
    const id = (await j('POST', '/p', { proposalId: P1 })).body.data.id;
    const r = await j('POST', `/p/${id}/status-link`, { send: true });
    expect(r.body.data.emailed).toBe('sent');
    const token = new URL(r.body.data.url).searchParams.get('t')!;
    const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
    expect(payload).toMatchObject({ k: 'project', id, email: '' });
    expect(payload.x).toBe(Math.floor(NOW.getTime() / 1000 + 180 * 86400));
    expect(mail).toHaveBeenCalledWith(expect.objectContaining({ to: 'client@acme.test', ctaUrl: r.body.data.url }));
    expect(payload.v).toBe(1);
    const revoked = await j('POST', `/p/${id}/revoke-links`, {});
    expect(revoked.body.data.linkVersion).toBe(2);
    const fresh = await j('POST', `/p/${id}/status-link`, {});
    expect(JSON.parse(Buffer.from(new URL(fresh.body.data.url).searchParams.get('t')!.split('.')[0], 'base64url').toString()).v).toBe(2);
    expect((await j('POST', `/p/00000000-0000-4000-8000-000000000000/revoke-links`, {})).status).toBe(404);
    const noSend = await j('POST', `/p/${id}/status-link`, {});
    expect(noSend.body.data.emailed).toBeUndefined();
    expect(mail).toHaveBeenCalledTimes(1);
  });
  it('status link needs the secret', async () => {
    const { pool } = fakePool();
    await serve((app) => app.use('/p', createProjectsRouter({ pool, now: () => NOW })));
    const id = (await j('POST', '/p', { proposalId: P1 })).body.data.id;
    delete process.env.AUDIT_LINK_SECRET;
    expect((await j('POST', `/p/${id}/status-link`, {})).status).toBe(503);
  });
});

describe('public status page', () => {
  const tokenFor = (id: string, over: Record<string, unknown> = {}, secret = SECRET) =>
    signLink({ k: 'project', id, company: 'Acme', email: '', x: Math.floor(NOW.getTime() / 1000) + 3600, ...over } as any, secret);
  const get = (t?: string) => fetch(`${base}/pub${t === undefined ? '' : `?t=${encodeURIComponent(t)}`}`).then(async (r) => ({ status: r.status, html: await r.text() }));

  async function setup() {
    const f = fakePool();
    await serve((app) => app.use('/pub', createPublicProjectRouter({ pool: f.pool, now: () => NOW })));
    const { project } = await createProjectFromProposal(f.pool, P1, { startsOn: '2026-03-01', now: NOW });
    return { ...f, id: project.id };
  }

  it('shows name, status, dates, milestones, handover and client notes for a valid link', async () => {
    const { pool, id } = await setup();
    await updateProject(pool, id, { status: 'in_progress', clientNotes: 'Demo on Tuesday' }, { now: NOW });
    await addMilestone(pool, id, { title: 'Design', note: 'INTERNAL-MILESTONE-NOTE' }, NOW);
    const m = await addMilestone(pool, id, { title: 'Build' }, NOW);
    await updateMilestone(pool, id, m.id, { done: true }, NOW);
    const r = await get(tokenFor(id));
    expect(r.status).toBe(200);
    expect(r.html).toContain('CRM build');
    expect(r.html).toContain('In progress');
    expect(r.html).toContain('29 March 2026');
    expect(r.html).toContain('Design');
    expect(r.html).toContain('Pending');
    expect(r.html).toContain('Done');
    expect(r.html).toContain('Handover checklist');
    expect(r.html).toContain('Demo on Tuesday');
    expect(r.html).toContain('dir="ltr"');
    expect(r.html).not.toContain('past its delivery date');
    expect(r.html).not.toContain('Free bug fixes until');
  });

  it('never contains emails, internal notes, company or other projects', async () => {
    const { pool, db, id } = await setup();
    await addMilestone(pool, id, { title: 'Design', note: 'INTERNAL-MILESTONE-NOTE' }, NOW);
    db.projects.push({ ...db.projects[0], id: '99999999-9999-4999-8999-999999999999', proposal_id: null, name: 'OTHER-SECRET-PROJECT' });
    const r = await get(tokenFor(id, { email: 'leak@x.test' }));
    for (const bad of ['client@acme.test', 'leak@x.test', 'INTERNAL-MILESTONE-NOTE', 'OTHER-SECRET-PROJECT', 'Sara', 'Acme', L1, P1]) expect(r.html).not.toContain(bad);
    expect(r.html).toContain('hello@hallaai.com');
  });

  it('shows the overdue note and, once delivered, the 30-day free-fix end date', async () => {
    const { pool, id } = await setup();
    await updateProject(pool, id, { status: 'in_progress', deliveryDate: '2026-03-01' }, { now: NOW });
    expect((await get(tokenFor(id))).html).toContain('past its delivery date');
    await updateProject(pool, id, { status: 'delivered' }, { force: true, now: NOW });
    const r = await get(tokenFor(id));
    expect(r.html).toContain('Free bug fixes until 9 April 2026');
    expect(r.html).not.toContain('past its delivery date');
  });

  it('escapes stored text everywhere', async () => {
    const { pool, id } = await setup();
    const x = '<script>alert(1)</script>';
    await updateProject(pool, id, { name: `N ${x}`, clientNotes: `C ${x}` }, { now: NOW });
    await addMilestone(pool, id, { title: `M ${x}` }, NOW);
    const r = await get(tokenFor(id));
    expect(r.html).not.toContain('<script>alert');
    expect(r.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect((r.html.match(/&lt;script&gt;/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('renders Arabic right to left when the proposal is Arabic', async () => {
    const { pool, db, id } = await setup();
    db.proposals[0].language = 'ar';
    await addMilestone(pool, id, { title: 'Design' }, NOW);
    const r = await get(tokenFor(id));
    expect(r.html).toContain('lang="ar" dir="rtl"');
    expect(r.html).toContain('حالة المشروع');
    expect(r.html).toContain('قائمة التسليم');
    expect(r.html).not.toContain('Handover checklist');
  });

  it('answers the same neutral page for bad, tampered, expired, wrong-kind, unknown and missing links', async () => {
    const { id } = await setup();
    const good = tokenFor(id);
    const [body, sig] = good.split('.');
    const tampered = `${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), id: '88888888-8888-4888-8888-888888888888' })).toString('base64url')}.${sig}`;
    const cases = [
      await get('garbage-token-that-is-long-enough'),
      await get(tampered),
      await get(tokenFor(id, { x: Math.floor(NOW.getTime() / 1000) - 10 })),
      await get(tokenFor(id, { k: 'proposal' })),
      await get(tokenFor(id, {}, 'another-secret')),
      await get(tokenFor('88888888-8888-4888-8888-888888888888')),
      await get(),
    ];
    // The expiry check above uses the real clock inside verifyLink unless now is passed; a token expired in 2026-03 is long gone today either way.
    for (const c of cases) {
      expect(c.status).toBe(404);
      expect(c.html).toBe(cases[0].html);
      expect(c.html).toContain('not valid or has expired');
      expect(c.html).not.toContain('CRM build');
    }
  });

  it('only answers GET', async () => {
    const { id } = await setup();
    const r = await fetch(`${base}/pub?t=${encodeURIComponent(tokenFor(id))}`, { method: 'POST' });
    expect(r.status).toBe(404);
  });
});
