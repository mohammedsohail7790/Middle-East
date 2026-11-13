/**
 * The team-only gate for the consultancy screens: closed by default, and it fails closed. The login table lookup is a stub.
 */
import { describe, expect, it, vi } from 'vitest';
import { consultancyAdminEmails, isConsultancyAdminEmail, requireConsultancyAdmin, adminEmail } from '../../../apps/gateway/src/services/consultancy/admin-access.js';

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;

describe('who is on the team list', () => {
  it('reads CONSULTANCY_ADMIN_EMAILS, trims and ignores case', () => {
    expect(consultancyAdminEmails(env({ CONSULTANCY_ADMIN_EMAILS: ' A@x.com , b@Y.com ,, ' }))).toEqual(['a@x.com', 'b@y.com']);
  });
  it('falls back to AUDIT_LEAD_EMAILS, the people who already review audits', () => {
    expect(consultancyAdminEmails(env({ AUDIT_LEAD_EMAILS: 'hello@h.com,owner@h.com' }))).toEqual(['hello@h.com', 'owner@h.com']);
  });
  it('prefers the specific list when both are set', () => {
    expect(consultancyAdminEmails(env({ CONSULTANCY_ADMIN_EMAILS: 'one@x.com', AUDIT_LEAD_EMAILS: 'two@x.com' }))).toEqual(['one@x.com']);
  });
  it('is empty, so nobody is let in, when neither is set', () => {
    expect(consultancyAdminEmails(env({}))).toEqual([]);
    expect(isConsultancyAdminEmail('anyone@x.com', env({}))).toBe(false);
  });
  it('matches an email regardless of case and never matches blanks', () => {
    const e = env({ CONSULTANCY_ADMIN_EMAILS: 'Team@Halla.com' });
    expect(isConsultancyAdminEmail('team@halla.com', e)).toBe(true);
    expect(isConsultancyAdminEmail('TEAM@HALLA.COM', e)).toBe(true);
    expect(isConsultancyAdminEmail('', e)).toBe(false);
    expect(isConsultancyAdminEmail(null, e)).toBe(false);
    expect(isConsultancyAdminEmail('teammate@halla.com', e)).toBe(false);
  });
});

describe('the middleware', () => {
  const e = env({ CONSULTANCY_ADMIN_EMAILS: 'team@halla.com' });
  const run = async (req: any, lookup: (id: string) => Promise<string | null>) => {
    const next = vi.fn();
    let status = 0;
    let body: any;
    const res: any = { status: (s: number) => { status = s; return res; }, json: (b: any) => { body = b; return res; } };
    await requireConsultancyAdmin({ lookup, env: e })(req, res, next);
    return { next, status, body };
  };
  const asUser = (userId?: string, source = 'user_jwt') => ({ tenant: { id: 't1', userId, source } });

  it('lets a signed-in team member through and records who they are', async () => {
    const req: any = asUser('u1');
    const r = await run(req, async () => 'Team@Halla.com');
    expect(r.next).toHaveBeenCalledTimes(1);
    expect(adminEmail(req)).toBe('team@halla.com');
  });

  it('refuses a signed-in user who is not on the list', async () => {
    const r = await run(asUser('u2'), async () => 'client@other.com');
    expect(r.status).toBe(403);
    expect(r.next).not.toHaveBeenCalled();
  });

  it('refuses a request with no signed-in user: no tenant, an API key, an internal call, or no user id', async () => {
    for (const req of [{}, { tenant: { id: 't', source: 'tenant_api_key' } }, { tenant: { id: 't', userId: 'u', source: 'internal_service' } }, asUser(undefined)]) {
      const lookup = vi.fn(async () => 'team@halla.com');
      const r = await run(req, lookup);
      expect(r.status).toBe(403);
      expect(r.next).not.toHaveBeenCalled();
      expect(lookup).not.toHaveBeenCalled();
    }
  });

  it('refuses a user the login table does not know', async () => {
    const r = await run(asUser('ghost'), async () => null);
    expect(r.status).toBe(403);
  });

  it('fails closed when the lookup itself breaks', async () => {
    const r = await run(asUser('u1'), async () => { throw new Error('db down'); });
    expect(r.status).toBe(403);
    expect(r.next).not.toHaveBeenCalled();
  });

  it('never trusts an email sent by the browser', async () => {
    const req: any = { ...asUser('u2'), headers: { 'x-user-email': 'team@halla.com' }, body: { email: 'team@halla.com' }, query: { email: 'team@halla.com' } };
    const r = await run(req, async () => 'client@other.com');
    expect(r.status).toBe(403);
  });
});
