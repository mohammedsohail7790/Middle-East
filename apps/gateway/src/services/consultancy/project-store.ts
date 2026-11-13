/**
 * Delivery projects and their milestones (tables consultancy_projects and consultancy_milestones). Plain parameterized SQL; the caller passes the pool.
 * Computed on the way out, never stored: `overdue` (the delivery date has passed and the project is not delivered or cancelled) and `warrantyEndsOn`
 * (delivered date plus 30 days: bug fixes are free until then).
 */
export interface Queryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

export const PROJECT_STATUSES = ['planned', 'in_progress', 'delivered', 'on_hold', 'cancelled'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const HANDOVER_KEYS = ['code', 'data', 'accounts', 'documentation'] as const;
export type Handover = Record<(typeof HANDOVER_KEYS)[number], boolean>;
export const WARRANTY_DAYS = 30;

export type ProjectErrorCode = 'not_found' | 'not_accepted' | 'invalid' | 'handover_incomplete';
export class ProjectError extends Error {
  constructor(public code: ProjectErrorCode, message: string) {
    super(message);
  }
}

export interface Milestone {
  id: string;
  projectId: string;
  title: string;
  dueOn: string | null;
  doneAt: string | null;
  done: boolean;
  note: string | null;
  position: number;
}

export interface Project {
  id: string;
  proposalId: string | null;
  leadId: string;
  company: string | null;
  name: string;
  status: ProjectStatus;
  startsOn: string | null;
  deliveryDate: string | null;
  deliveredAt: string | null;
  handover: Handover;
  clientNotes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  overdue: boolean;
  warrantyEndsOn: string | null;
  milestoneTotal?: number;
  milestoneDone?: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isoDay = (d: Date): string => d.toISOString().slice(0, 10);
const asIso = (v: unknown): string | null => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));

function validDay(v: unknown): v is string {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && isoDay(d) === v;
}

/** A calendar day (YYYY-MM-DD) plus a number of days, in UTC so daylight saving never shifts it. */
export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDay(d);
}

/** Start date plus the proposal's weeks; null when the proposal has no delivery weeks. */
export function computeDeliveryDate(startsOn: string, weeks: number | null | undefined): string | null {
  return typeof weeks === 'number' && Number.isFinite(weeks) && weeks > 0 ? addDays(startsOn, Math.round(weeks) * 7) : null;
}

export function isOverdue(p: { deliveryDate: string | null; status: string }, now: Date = new Date()): boolean {
  if (!p.deliveryDate || p.status === 'delivered' || p.status === 'cancelled') return false;
  return p.deliveryDate < isoDay(now);
}

export function warrantyEndsOn(deliveredAt: string | null): string | null {
  return deliveredAt ? addDays(deliveredAt.slice(0, 10), WARRANTY_DAYS) : null;
}

const PROJECT_COLS =
  `p.id, p.proposal_id, p.lead_id, p.name, p.status, to_char(p.starts_on, 'YYYY-MM-DD') AS starts_on, to_char(p.delivery_date, 'YYYY-MM-DD') AS delivery_date, ` +
  `p.delivered_at, p.handover, p.client_notes, p.created_at, p.updated_at`;
const MILESTONE_COLS = `m.id, m.project_id, m.title, to_char(m.due_on, 'YYYY-MM-DD') AS due_on, m.done_at, m.note, m.position`;

const cleanHandover = (raw: unknown): Handover => {
  const o = (typeof raw === 'string' ? safeJson(raw) : raw) as Record<string, unknown> | null;
  return { code: o?.code === true, data: o?.data === true, accounts: o?.accounts === true, documentation: o?.documentation === true };
};
const safeJson = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

function toProject(r: any, now: Date): Project {
  const p: Project = {
    id: r.id,
    proposalId: r.proposal_id ?? null,
    leadId: r.lead_id,
    company: r.company ?? null,
    name: r.name,
    status: r.status,
    startsOn: r.starts_on ?? null,
    deliveryDate: r.delivery_date ?? null,
    deliveredAt: asIso(r.delivered_at),
    handover: cleanHandover(r.handover),
    clientNotes: r.client_notes ?? null,
    createdAt: asIso(r.created_at),
    updatedAt: asIso(r.updated_at),
    overdue: false,
    warrantyEndsOn: null,
  };
  p.overdue = isOverdue(p, now);
  p.warrantyEndsOn = p.status === 'delivered' ? warrantyEndsOn(p.deliveredAt) : null;
  if (r.milestone_total !== undefined) {
    p.milestoneTotal = Number(r.milestone_total) || 0;
    p.milestoneDone = Number(r.milestone_done) || 0;
  }
  return p;
}

export function toMilestone(r: any): Milestone {
  return {
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    dueOn: r.due_on ?? null,
    doneAt: asIso(r.done_at),
    done: r.done_at != null,
    note: r.note ?? null,
    position: Number(r.position) || 0,
  };
}

const text = (v: unknown, max: number): string | null => {
  if (v == null) return null;
  const s = String(v).trim().slice(0, max);
  return s || null;
};

export interface CreateProjectInput {
  name: string;
  leadId: string;
  startsOn?: string | null;
  deliveryDate?: string | null;
  clientNotes?: string | null;
}

export async function createProject(db: Queryable, input: CreateProjectInput, now: Date = new Date()): Promise<Project> {
  const name = text(input.name, 200);
  if (!name) throw new ProjectError('invalid', 'A project needs a name.');
  if (!input.leadId) throw new ProjectError('invalid', 'A project needs a lead.');
  for (const d of [input.startsOn, input.deliveryDate]) if (d != null && !validDay(d)) throw new ProjectError('invalid', 'Dates must look like 2026-01-31.');
  const lead = await db.query(`SELECT id FROM consultancy_leads WHERE id = $1`, [input.leadId]);
  if (!lead.rows[0]) throw new ProjectError('not_found', 'Lead not found.');
  const r = await db.query(
    `INSERT INTO consultancy_projects (lead_id, name, starts_on, delivery_date, client_notes) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [input.leadId, name, input.startsOn ?? null, input.deliveryDate ?? null, text(input.clientNotes, 4000)],
  );
  return (await getProject(db, r.rows[0].id, now))!;
}

/** Makes the delivery project for an accepted proposal. The proposal must be accepted; calling again returns the project already made (created: false). */
export async function createProjectFromProposal(
  db: Queryable,
  proposalId: string,
  opts: { startsOn?: string | null; now?: Date } = {},
): Promise<{ project: Project; created: boolean }> {
  const now = opts.now ?? new Date();
  const pr = await db.query(`SELECT id, lead_id, title, status, delivery_weeks FROM consultancy_proposals WHERE id = $1`, [proposalId]);
  const proposal = pr.rows[0];
  if (!proposal) throw new ProjectError('not_found', 'Proposal not found.');
  if (proposal.status !== 'accepted') throw new ProjectError('not_accepted', 'Only an accepted proposal can become a project.');
  const existing = await db.query(`SELECT id FROM consultancy_projects WHERE proposal_id = $1`, [proposalId]);
  if (existing.rows[0]) return { project: (await getProject(db, existing.rows[0].id, now))!, created: false };
  if (opts.startsOn != null && !validDay(opts.startsOn)) throw new ProjectError('invalid', 'Dates must look like 2026-01-31.');
  const startsOn = opts.startsOn ?? isoDay(now);
  const delivery = computeDeliveryDate(startsOn, proposal.delivery_weeks);
  const ins = await db.query(
    `INSERT INTO consultancy_projects (proposal_id, lead_id, name, starts_on, delivery_date) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (proposal_id) DO NOTHING RETURNING id`,
    [proposalId, proposal.lead_id, String(proposal.title).slice(0, 200), startsOn, delivery],
  );
  if (ins.rows[0]) return { project: (await getProject(db, ins.rows[0].id, now))!, created: true };
  // Lost a race with another request: the unique proposal_id means the project exists now.
  const again = await db.query(`SELECT id FROM consultancy_projects WHERE proposal_id = $1`, [proposalId]);
  return { project: (await getProject(db, again.rows[0].id, now))!, created: false };
}

export async function getProject(db: Queryable, id: string, now: Date = new Date()): Promise<(Project & { milestones: Milestone[] }) | null> {
  const r = await db.query(
    `SELECT ${PROJECT_COLS}, c.company FROM consultancy_projects p LEFT JOIN consultancy_leads c ON c.id = p.lead_id WHERE p.id = $1`,
    [id],
  );
  if (!r.rows[0]) return null;
  const ms = await db.query(`SELECT ${MILESTONE_COLS} FROM consultancy_milestones m WHERE m.project_id = $1 ORDER BY m.position ASC, m.created_at ASC`, [id]);
  return { ...toProject(r.rows[0], now), milestones: ms.rows.map(toMilestone) };
}

export interface ListFilter {
  status?: string;
  overdue?: boolean;
  search?: string;
}

export async function listProjects(db: Queryable, filter: ListFilter = {}, now: Date = new Date()): Promise<Project[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status) {
    params.push(filter.status);
    where.push(`p.status = $${params.length}`);
  }
  if (filter.search?.trim()) {
    params.push(`%${filter.search.trim().replace(/[\\%_]/g, '\\$&')}%`);
    where.push(`(p.name ILIKE $${params.length} OR c.company ILIKE $${params.length})`);
  }
  const r = await db.query(
    `SELECT ${PROJECT_COLS}, c.company,
       (SELECT count(*) FROM consultancy_milestones m WHERE m.project_id = p.id) AS milestone_total,
       (SELECT count(*) FROM consultancy_milestones m WHERE m.project_id = p.id AND m.done_at IS NOT NULL) AS milestone_done
     FROM consultancy_projects p LEFT JOIN consultancy_leads c ON c.id = p.lead_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY p.created_at DESC LIMIT 500`,
    params,
  );
  const all = r.rows.map((row) => toProject(row, now));
  return filter.overdue ? all.filter((p) => p.overdue) : all;
}

export interface ProjectPatch {
  name?: string;
  status?: string;
  startsOn?: string | null;
  deliveryDate?: string | null;
  clientNotes?: string | null;
  handover?: Partial<Handover>;
}

export async function updateProject(
  db: Queryable,
  id: string,
  patch: ProjectPatch,
  opts: { force?: boolean; now?: Date } = {},
): Promise<Project & { milestones: Milestone[] }> {
  const now = opts.now ?? new Date();
  const cur = await getProject(db, id, now);
  if (!cur) throw new ProjectError('not_found', 'Project not found.');
  const sets: string[] = [];
  const params: unknown[] = [];
  const set = (col: string, val: unknown, cast = '') => {
    params.push(val);
    sets.push(`${col} = $${params.length}${cast}`);
  };

  if (patch.name !== undefined) {
    const n = text(patch.name, 200);
    if (!n) throw new ProjectError('invalid', 'The name cannot be empty.');
    set('name', n);
  }
  for (const [key, col] of [['startsOn', 'starts_on'], ['deliveryDate', 'delivery_date']] as const) {
    const v = patch[key];
    if (v === undefined) continue;
    if (v !== null && v !== '' && !validDay(v)) throw new ProjectError('invalid', 'Dates must look like 2026-01-31.');
    set(col, v === '' ? null : v);
  }
  if (patch.clientNotes !== undefined) set('client_notes', text(patch.clientNotes, 4000));

  const handover: Handover = { ...cur.handover };
  if (patch.handover !== undefined) {
    for (const k of HANDOVER_KEYS) if (patch.handover[k] !== undefined) handover[k] = patch.handover[k] === true;
    set('handover', JSON.stringify(handover), '::jsonb');
  }

  if (patch.status !== undefined) {
    if (!(PROJECT_STATUSES as readonly string[]).includes(patch.status)) throw new ProjectError('invalid', 'Unknown status.');
    if (patch.status === 'delivered' && cur.status !== 'delivered') {
      if (!opts.force && !HANDOVER_KEYS.every((k) => handover[k])) {
        throw new ProjectError('handover_incomplete', 'Tick code, data, accounts and documentation before marking the project delivered.');
      }
      set('delivered_at', now.toISOString());
    } else if (patch.status !== 'delivered' && cur.status === 'delivered') {
      set('delivered_at', null);
    }
    set('status', patch.status);
  }

  if (!sets.length) return cur;
  set('updated_at', now.toISOString());
  params.push(id);
  await db.query(`UPDATE consultancy_projects SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  return (await getProject(db, id, now))!;
}

// ---- Milestones ----

export interface MilestoneInput {
  title?: string;
  dueOn?: string | null;
  note?: string | null;
  done?: boolean;
}

export async function addMilestone(db: Queryable, projectId: string, input: MilestoneInput, now: Date = new Date()): Promise<Milestone> {
  const title = text(input.title, 200);
  if (!title) throw new ProjectError('invalid', 'A milestone needs a title.');
  if (input.dueOn != null && input.dueOn !== '' && !validDay(input.dueOn)) throw new ProjectError('invalid', 'Dates must look like 2026-01-31.');
  const proj = await db.query(`SELECT id FROM consultancy_projects WHERE id = $1`, [projectId]);
  if (!proj.rows[0]) throw new ProjectError('not_found', 'Project not found.');
  const pos = await db.query(`SELECT COALESCE(MAX(position), -1) + 1 AS next FROM consultancy_milestones WHERE project_id = $1`, [projectId]);
  const r = await db.query(
    `INSERT INTO consultancy_milestones (project_id, title, due_on, note, position, done_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [projectId, title, input.dueOn || null, text(input.note, 2000), Number(pos.rows[0]?.next) || 0, input.done === true ? now.toISOString() : null],
  );
  return (await getMilestone(db, projectId, r.rows[0].id))!;
}

async function getMilestone(db: Queryable, projectId: string, mid: string): Promise<Milestone | null> {
  const r = await db.query(`SELECT ${MILESTONE_COLS} FROM consultancy_milestones m WHERE m.id = $1 AND m.project_id = $2`, [mid, projectId]);
  return r.rows[0] ? toMilestone(r.rows[0]) : null;
}

/** Edits a milestone and/or marks it done or not done (`done`). Scoped to the project so an id from another project cannot be touched. */
export async function updateMilestone(db: Queryable, projectId: string, mid: string, input: MilestoneInput, now: Date = new Date()): Promise<Milestone> {
  const cur = await getMilestone(db, projectId, mid);
  if (!cur) throw new ProjectError('not_found', 'Milestone not found.');
  const sets: string[] = [];
  const params: unknown[] = [];
  const set = (col: string, val: unknown) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };
  if (input.title !== undefined) {
    const t = text(input.title, 200);
    if (!t) throw new ProjectError('invalid', 'A milestone needs a title.');
    set('title', t);
  }
  if (input.dueOn !== undefined) {
    if (input.dueOn !== null && input.dueOn !== '' && !validDay(input.dueOn)) throw new ProjectError('invalid', 'Dates must look like 2026-01-31.');
    set('due_on', input.dueOn || null);
  }
  if (input.note !== undefined) set('note', text(input.note, 2000));
  if (input.done !== undefined) {
    if (input.done && !cur.done) set('done_at', now.toISOString());
    else if (!input.done) set('done_at', null);
  }
  if (!sets.length) return cur;
  params.push(mid, projectId);
  await db.query(`UPDATE consultancy_milestones SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND project_id = $${params.length}`, params);
  return (await getMilestone(db, projectId, mid))!;
}

export async function deleteMilestone(db: Queryable, projectId: string, mid: string): Promise<void> {
  const r = await db.query(`DELETE FROM consultancy_milestones WHERE id = $1 AND project_id = $2 RETURNING id`, [mid, projectId]);
  if (!r.rows[0]) throw new ProjectError('not_found', 'Milestone not found.');
}

/** Puts the milestones in the given order. The list must contain exactly the project's milestone ids. */
export async function reorderMilestones(db: Queryable, projectId: string, orderedIds: unknown): Promise<Milestone[]> {
  if (!Array.isArray(orderedIds) || orderedIds.some((i) => typeof i !== 'string')) throw new ProjectError('invalid', 'Send the milestone ids in the new order.');
  const ids = orderedIds as string[];
  const proj = await db.query(`SELECT id FROM consultancy_projects WHERE id = $1`, [projectId]);
  if (!proj.rows[0]) throw new ProjectError('not_found', 'Project not found.');
  const have = await db.query(`SELECT id FROM consultancy_milestones WHERE project_id = $1`, [projectId]);
  const haveIds = new Set<string>(have.rows.map((r) => r.id));
  if (ids.length !== haveIds.size || new Set(ids).size !== ids.length || !ids.every((i) => haveIds.has(i))) {
    throw new ProjectError('invalid', 'The list must contain every milestone of this project exactly once.');
  }
  for (let i = 0; i < ids.length; i++) {
    await db.query(`UPDATE consultancy_milestones SET position = $1 WHERE id = $2 AND project_id = $3`, [i, ids[i], projectId]);
  }
  const r = await db.query(`SELECT ${MILESTONE_COLS} FROM consultancy_milestones m WHERE m.project_id = $1 ORDER BY m.position ASC, m.created_at ASC`, [projectId]);
  return r.rows.map(toMilestone);
}

// ---- Team helpers and the public view ----

export async function listAcceptedProposals(db: Queryable): Promise<Array<{ id: string; title: string; company: string | null; hasProject: boolean }>> {
  const r = await db.query(
    `SELECT pr.id, pr.title, c.company, EXISTS (SELECT 1 FROM consultancy_projects p WHERE p.proposal_id = pr.id) AS has_project
     FROM consultancy_proposals pr LEFT JOIN consultancy_leads c ON c.id = pr.lead_id WHERE pr.status = 'accepted' ORDER BY pr.accepted_at DESC NULLS LAST LIMIT 200`,
  );
  return r.rows.map((x) => ({ id: x.id, title: x.title, company: x.company ?? null, hasProject: x.has_project === true }));
}

/** Who a status link is for: the client's company and email (never shown on the public page) and the proposal's language. */
export async function getProjectContact(db: Queryable, projectId: string): Promise<{ company: string; email: string | null; contactName: string | null; language: 'en' | 'ar'; name: string } | null> {
  const r = await db.query(
    `SELECT p.name, c.company, c.email, c.contact_name, pr.language FROM consultancy_projects p
     LEFT JOIN consultancy_leads c ON c.id = p.lead_id LEFT JOIN consultancy_proposals pr ON pr.id = p.proposal_id WHERE p.id = $1`,
    [projectId],
  );
  const x = r.rows[0];
  if (!x) return null;
  return { name: x.name, company: x.company ?? '', email: x.email ?? null, contactName: x.contact_name ?? null, language: x.language === 'ar' ? 'ar' : 'en' };
}

export interface PublicProjectView {
  name: string;
  status: ProjectStatus;
  startsOn: string | null;
  deliveryDate: string | null;
  overdue: boolean;
  warrantyEndsOn: string | null;
  handover: Handover;
  clientNotes: string | null;
  language: 'en' | 'ar';
  milestones: Array<{ title: string; dueOn: string | null; done: boolean }>;
}

/** Exactly what the client may see. Deliberately a separate, narrow query: no lead, no email, no proposal, no milestone notes, no ids of anything else. */
export async function getPublicProjectView(db: Queryable, projectId: string, now: Date = new Date()): Promise<PublicProjectView | null> {
  const r = await db.query(
    `SELECT p.name, p.status, to_char(p.starts_on, 'YYYY-MM-DD') AS starts_on, to_char(p.delivery_date, 'YYYY-MM-DD') AS delivery_date, p.delivered_at, p.handover, p.client_notes, pr.language
     FROM consultancy_projects p LEFT JOIN consultancy_proposals pr ON pr.id = p.proposal_id WHERE p.id = $1`,
    [projectId],
  );
  const x = r.rows[0];
  if (!x) return null;
  const ms = await db.query(
    `SELECT m.title, to_char(m.due_on, 'YYYY-MM-DD') AS due_on, m.done_at FROM consultancy_milestones m WHERE m.project_id = $1 ORDER BY m.position ASC, m.created_at ASC`,
    [projectId],
  );
  const deliveredAt = asIso(x.delivered_at);
  const base = { deliveryDate: x.delivery_date ?? null, status: x.status as ProjectStatus };
  return {
    name: x.name,
    status: x.status,
    startsOn: x.starts_on ?? null,
    deliveryDate: base.deliveryDate,
    overdue: isOverdue(base, now),
    warrantyEndsOn: x.status === 'delivered' ? warrantyEndsOn(deliveredAt) : null,
    handover: cleanHandover(x.handover),
    clientNotes: x.client_notes ?? null,
    language: x.language === 'ar' ? 'ar' : 'en',
    milestones: ms.rows.map((m) => ({ title: m.title, dueOn: m.due_on ?? null, done: m.done_at != null })),
  };
}
