import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FAILED_CALLS_THRESHOLD,
  TEAM_ALERT_INTERVAL_MS,
  mayTeamAlert,
  noteCallStatusForTeam,
  noteDependencyDownForTeam,
  noteStripeWebhookFailureForTeam,
  recordFailure,
  resetTeamAlertState,
  sendTeamAlert,
  teamAlertRecipients,
} from '../../../apps/gateway/src/services/ops-alerts/team-alert.js';

const mk = (now = 1_000_000) => {
  const send = vi.fn().mockResolvedValue(undefined);
  return { send, now: () => now, recipients: () => ['hk@example.com', 'owner@example.com'] };
};
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => resetTeamAlertState());

describe('who gets team alerts', () => {
  it('uses TEAM_ALERT_EMAILS first, then the audit list, then the team inbox', () => {
    expect(teamAlertRecipients({ TEAM_ALERT_EMAILS: 'a@x.com, b@x.com', AUDIT_LEAD_EMAILS: 'c@x.com' } as any)).toEqual(['a@x.com', 'b@x.com']);
    expect(teamAlertRecipients({ AUDIT_LEAD_EMAILS: 'c@x.com' } as any)).toEqual(['c@x.com']);
    expect(teamAlertRecipients({} as any)).toEqual(['hello@hallaai.com']);
  });

  it('drops anything that is not an email address', () => {
    expect(teamAlertRecipients({ TEAM_ALERT_EMAILS: 'a@x.com, not-an-email, , b@' } as any)).toEqual(['a@x.com']);
  });
});

describe('the hourly limit', () => {
  it('allows the first alert of a kind and blocks the same kind for an hour', () => {
    expect(mayTeamAlert(undefined, 5_000)).toBe(true);
    expect(mayTeamAlert(5_000, 5_000 + TEAM_ALERT_INTERVAL_MS - 1)).toBe(false);
    expect(mayTeamAlert(5_000, 5_000 + TEAM_ALERT_INTERVAL_MS)).toBe(true);
  });

  it('sends one email and then stays quiet for that kind, but not for another kind', async () => {
    const deps = mk();
    expect(await sendTeamAlert({ kind: 'dependency_down', title: 'database unavailable', detail: 'x' }, deps)).toBe('sent');
    expect(await sendTeamAlert({ kind: 'dependency_down', title: 'database unavailable', detail: 'x' }, deps)).toBe('limited');
    expect(await sendTeamAlert({ kind: 'calls_failing', title: 'Calls are failing', detail: 'y' }, deps)).toBe('sent');
    expect(deps.send).toHaveBeenCalledTimes(2);
  });

  it('allows the kind again once an hour has passed', async () => {
    await sendTeamAlert({ kind: 'dependency_down', title: 't', detail: 'd' }, mk(1_000_000));
    const later = mk(1_000_000 + TEAM_ALERT_INTERVAL_MS);
    expect(await sendTeamAlert({ kind: 'dependency_down', title: 't', detail: 'd' }, later)).toBe('sent');
  });
});

describe('sending', () => {
  it('emails every recipient with a clear subject and escapes the detail', async () => {
    const deps = mk();
    await sendTeamAlert({ kind: 'dependency_down', title: 'database unavailable', detail: '<script>x</script>' }, deps);
    const arg = deps.send.mock.calls[0][0];
    expect(arg.to).toEqual(['hk@example.com', 'owner@example.com']);
    expect(arg.subject).toBe('Halla AI alert: database unavailable');
    expect(arg.html).not.toContain('<script>');
    expect(arg.html).toContain('&lt;script&gt;');
  });

  it('cuts a long detail to 400 characters', async () => {
    const deps = mk();
    await sendTeamAlert({ kind: 'dependency_down', title: 't', detail: 'z'.repeat(2000) }, deps);
    expect(deps.send.mock.calls[0][0].html).not.toContain('z'.repeat(401));
  });

  it('never throws when the email cannot be sent', async () => {
    const deps = { ...mk(), send: vi.fn().mockRejectedValue(new Error('Resend refused')) };
    expect(await sendTeamAlert({ kind: 'dependency_down', title: 't', detail: 'd' }, deps)).toBe('failed');
  });

  it('does nothing when there is nobody to tell', async () => {
    const deps = { ...mk(), recipients: () => [] as string[] };
    expect(await sendTeamAlert({ kind: 'dependency_down', title: 't', detail: 'd' }, deps)).toBe('failed');
    expect(deps.send).not.toHaveBeenCalled();
  });
});

describe('failing calls', () => {
  it('counts failures inside the last hour and drops the older ones', () => {
    const times: number[] = [];
    expect(recordFailure(times, 1000)).toBe(false);
    expect(recordFailure(times, 2000)).toBe(false);
    expect(recordFailure(times, 3000)).toBe(true);
    const old: number[] = [0, 1, 2];
    expect(recordFailure(old, TEAM_ALERT_INTERVAL_MS + 10)).toBe(false);
    expect(old).toEqual([TEAM_ALERT_INTERVAL_MS + 10]);
  });

  it('tells the team on the third failed call in an hour, and ignores busy and unanswered calls', async () => {
    const deps = mk();
    noteCallStatusForTeam('busy', deps);
    noteCallStatusForTeam('no-answer', deps);
    noteCallStatusForTeam('completed', deps);
    for (let i = 0; i < FAILED_CALLS_THRESHOLD - 1; i++) noteCallStatusForTeam('failed', deps);
    await flush();
    expect(deps.send).not.toHaveBeenCalled();
    noteCallStatusForTeam('FAILED', deps);
    await flush();
    expect(deps.send).toHaveBeenCalledTimes(1);
    expect(deps.send.mock.calls[0][0].subject).toContain('Calls are failing');
  });

  it('never puts a phone number or call id in the email', async () => {
    const deps = mk();
    for (let i = 0; i < 3; i++) noteCallStatusForTeam('failed', deps);
    await flush();
    expect(deps.send.mock.calls[0][0].html).not.toMatch(/\+\d{6,}|CA[0-9a-f]{32}/);
  });
});

describe('dependency down and Stripe webhooks', () => {
  it('names the dependency that is down', async () => {
    const deps = mk();
    noteDependencyDownForTeam({ database: 'connection refused' }, deps);
    await flush();
    expect(deps.send.mock.calls[0][0].subject).toBe('Halla AI alert: database unavailable');
    expect(deps.send.mock.calls[0][0].html).toContain('connection refused');
  });

  it('says nothing when nothing is down', async () => {
    const deps = mk();
    noteDependencyDownForTeam({}, deps);
    await flush();
    expect(deps.send).not.toHaveBeenCalled();
  });

  it('reports a failed Stripe webhook with its event type and id', async () => {
    const deps = mk();
    noteStripeWebhookFailureForTeam('invoice.paid', 'evt_123', new Error('tenant not found'), deps);
    await flush();
    const html = deps.send.mock.calls[0][0].html;
    expect(html).toContain('invoice.paid');
    expect(html).toContain('evt_123');
    expect(html).toContain('tenant not found');
  });
});
