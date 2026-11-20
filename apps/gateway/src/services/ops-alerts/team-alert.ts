import { Resend } from 'resend';
import { logger } from '../logger.js';
import { throwIfRejected } from '../email-delivery.js';
import { escapeHtml, renderBrandedEmail, stripToPlainText } from '../automation/email-template.js';

/**
 * Mail to ourselves when something breaks that a client cannot fix and would never tell us about: a Stripe webhook that failed to process, calls failing, a dependency down.
 * It goes to TEAM_ALERT_EMAILS (comma separated), falling back to the audit list so Hk and the owner both get it, then to hello@hallaai.com.
 * It never throws and never blocks the caller, and each kind of alert sends at most one email an hour, so a bad hour is one email and not a flood.
 * The limit is kept per gateway instance (two instances can each send one), and it starts fresh after a restart.
 */
export const TEAM_ALERT_INTERVAL_MS = 60 * 60 * 1000;
export const FAILED_CALLS_THRESHOLD = 3;

export type TeamAlertKind = 'stripe_webhook_failed' | 'calls_failing' | 'dependency_down';

export interface TeamAlert {
  kind: TeamAlertKind;
  title: string;
  /** Plain facts only: no phone numbers, no names, no raw payloads. Cut to 400 characters. */
  detail: string;
}

export function teamAlertRecipients(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.TEAM_ALERT_EMAILS || env.AUDIT_LEAD_EMAILS || env.FIT_CHECK_LEAD_EMAILS || env.CONSULT_LEAD_EMAIL || 'hello@hallaai.com')
    .split(',')
    .map((a) => a.trim())
    .filter((a) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a));
}

/** Whether an alert of this kind may go out now, given when the same kind last went out (ms since epoch, or undefined). */
export function mayTeamAlert(lastSentAt: number | undefined, now: number): boolean {
  return lastSentAt === undefined || now - lastSentAt >= TEAM_ALERT_INTERVAL_MS;
}

/** True once there have been `threshold` failures within the last hour. `times` is the list of failure times in ms; old ones are dropped in place. */
export function recordFailure(times: number[], now: number, threshold = FAILED_CALLS_THRESHOLD): boolean {
  while (times.length && now - times[0] >= TEAM_ALERT_INTERVAL_MS) times.shift();
  times.push(now);
  return times.length >= threshold;
}

export interface TeamAlertDeps {
  send: (opts: { to: string[]; subject: string; html: string }) => Promise<void>;
  now: () => number;
  recipients: () => string[];
}

const lastSent = new Map<TeamAlertKind, number>();
const failedCalls: number[] = [];

/** The last alerts actually emailed, newest first, kept in memory only (cleared on restart) for the team usage page. */
export interface SentTeamAlert { kind: TeamAlertKind; title: string; at: string }
const sentLog: SentTeamAlert[] = [];
export const SENT_LOG_LIMIT = 20;
export function recentTeamAlerts(): SentTeamAlert[] {
  return sentLog.slice();
}

/** Test helper: forget what was sent. */
export function resetTeamAlertState(): void {
  lastSent.clear();
  failedCalls.length = 0;
  sentLog.length = 0;
}

async function defaultSend({ to, subject, html }: { to: string[]; subject: string; html: string }): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  throwIfRejected(await new Resend(key).emails.send({ from: `Halla AI <${process.env.EMAIL_FROM || 'noreply@hallaai.com'}>`, to, subject, html, text: stripToPlainText(html) }));
}

const defaults = (): TeamAlertDeps => ({ send: defaultSend, now: () => Date.now(), recipients: () => teamAlertRecipients() });

export async function sendTeamAlert(alert: TeamAlert, inject?: Partial<TeamAlertDeps>): Promise<'sent' | 'limited' | 'failed'> {
  try {
    const deps = { ...defaults(), ...inject };
    const now = deps.now();
    if (!mayTeamAlert(lastSent.get(alert.kind), now)) return 'limited';
    // Reserve the slot first so two failures at the same moment cannot both send.
    lastSent.set(alert.kind, now);
    const to = deps.recipients();
    if (to.length === 0) return 'failed';
    const detail = String(alert.detail ?? '').slice(0, 400);
    const html = renderBrandedEmail({
      eyebrow: 'Team alert',
      title: alert.title,
      bodyHtml: `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;">${escapeHtml(detail)}</p><p style="margin:0;font-size:13px;line-height:1.6;color:#6b675e;">Time: ${escapeHtml(new Date(now).toISOString())}. At most one email of this kind is sent an hour.</p>`,
    });
    await deps.send({ to, subject: `Halla AI alert: ${alert.title}`, html });
    sentLog.unshift({ kind: alert.kind, title: alert.title, at: new Date(now).toISOString() });
    if (sentLog.length > SENT_LOG_LIMIT) sentLog.length = SENT_LOG_LIMIT;
    return 'sent';
  } catch (error) {
    logger.warn('[TeamAlert] Could not send a team alert', { kind: alert.kind, error: error instanceof Error ? error.message : String(error) });
    return 'failed';
  }
}

/** A call ended as "failed". Once three have failed within an hour the team is told. A call that was only busy or unanswered is normal and never counts. */
export function noteCallStatusForTeam(callStatus: string, inject?: Partial<TeamAlertDeps>): void {
  if (String(callStatus ?? '').toLowerCase() !== 'failed') return;
  const now = (inject?.now ?? Date.now)();
  if (!recordFailure(failedCalls, now)) return;
  void sendTeamAlert(
    { kind: 'calls_failing', title: 'Calls are failing', detail: `${failedCalls.length} calls failed in the last hour. Check Twilio and the gateway logs.` },
    inject,
  );
}

/** The readiness check found a critical dependency down. */
export function noteDependencyDownForTeam(failed: Record<string, string>, inject?: Partial<TeamAlertDeps>): void {
  const names = Object.keys(failed);
  if (names.length === 0) return;
  void sendTeamAlert(
    { kind: 'dependency_down', title: `${names.join(' and ')} unavailable`, detail: names.map((n) => `${n}: ${failed[n]}`).join('. ') },
    inject,
  );
}

/** A Stripe webhook arrived with a valid signature but processing it threw. Stripe retries, but nobody would otherwise know. */
export function noteStripeWebhookFailureForTeam(eventType: string, eventId: string, error: unknown, inject?: Partial<TeamAlertDeps>): void {
  const message = error instanceof Error ? error.message : String(error);
  void sendTeamAlert(
    { kind: 'stripe_webhook_failed', title: 'A Stripe webhook failed to process', detail: `Event ${eventType} (${eventId}) could not be processed: ${message}. Stripe will retry it; check the gateway logs and the Stripe dashboard.` },
    inject,
  );
}
