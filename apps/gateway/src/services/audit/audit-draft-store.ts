import { createHash } from 'node:crypto';
import type { Pool } from 'pg';

/**
 * A server-side copy of the half-filled audit questionnaire (table audit_form_drafts, migration 084), so a client can carry on from another device.
 * The row is keyed by the SHA-256 of the private link token, never the token itself. Plain SQL with parameters; the functions take the pool so tests can pass a stand-in.
 */
export const MAX_DRAFT_BYTES = 200 * 1024;
const MAX_DEPTH = 4;
const MAX_KEYS = 400;
const KEY_PATTERN = /^[A-Za-z0-9_.-]{1,80}$/;

export const tokenHash = (token: string): string => createHash('sha256').update(token, 'utf8').digest('hex');

export interface StoredDraft {
  data: Record<string, unknown>;
  updatedAt: string;
}

const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/** Returns an error message when the draft is not acceptable, or null when it is fine. */
export function checkDraftData(data: unknown): string | null {
  if (!isPlain(data)) return 'The draft must be a JSON object.';
  let keys = 0;
  const walk = (value: unknown, depth: number): string | null => {
    if (depth > MAX_DEPTH) return 'The draft is nested too deeply.';
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? null : 'The draft contains an invalid number.';
    if (Array.isArray(value)) {
      for (const item of value) {
        const err = walk(item, depth + 1);
        if (err) return err;
      }
      return null;
    }
    if (isPlain(value)) {
      for (const [k, v] of Object.entries(value)) {
        if (!KEY_PATTERN.test(k) || k === '__proto__' || k === 'constructor' || k === 'prototype') return 'The draft contains an invalid field name.';
        if (++keys > MAX_KEYS) return 'The draft has too many fields.';
        const err = walk(v, depth + 1);
        if (err) return err;
      }
      return null;
    }
    return 'The draft contains a value that cannot be saved.';
  };
  const err = walk(data, 1);
  if (err) return err;
  if (Buffer.byteLength(JSON.stringify(data), 'utf8') > MAX_DRAFT_BYTES) return 'The draft is too large to save.';
  return null;
}

export async function getDraft(pool: Pick<Pool, 'query'>, token: string): Promise<StoredDraft | null> {
  const r = await pool.query('SELECT data, updated_at FROM public.audit_form_drafts WHERE token_hash = $1', [tokenHash(token)]);
  const row = r.rows[0] as { data: Record<string, unknown>; updated_at: Date | string } | undefined;
  if (!row) return null;
  return { data: row.data, updatedAt: new Date(row.updated_at).toISOString() };
}

export async function saveDraft(pool: Pick<Pool, 'query'>, token: string, data: Record<string, unknown>): Promise<string> {
  const r = await pool.query(
    `INSERT INTO public.audit_form_drafts (token_hash, data, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (token_hash) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
     RETURNING updated_at`,
    [tokenHash(token), JSON.stringify(data)],
  );
  const row = r.rows[0] as { updated_at: Date | string } | undefined;
  return new Date(row?.updated_at ?? Date.now()).toISOString();
}

export async function deleteDraft(pool: Pick<Pool, 'query'>, token: string): Promise<void> {
  await pool.query('DELETE FROM public.audit_form_drafts WHERE token_hash = $1', [tokenHash(token)]);
}
