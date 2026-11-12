import type { Pool } from 'pg';
import { logger } from '../logger.js';
import { escapeHtml, renderBrandedEmail, stripToPlainText } from '../automation/email-template.js';
import { alertFromBillingWarning, alertFromIntegrationFailure, type AlertCandidate, type BillingWarningInput } from './alert-rules.js';
import { markEmailed, raiseAlert } from './alert-store.js';

/**
 * Raising an alert: save it once, then email the owner unless it is only information or the business switched alert emails off.
 * It never throws and never blocks the caller. Calls, billing and integrations must carry on whatever happens here; a failed save or email is logged and that is all.
 * Everything that touches the outside is passed in, so the tests run it with no database and no email service.
 */
export interface AlertDeps {
  pool: Pick<Pool, 'query'>;
  ownerEmails: (tenantId: string) => Promise<string[]>;
  sendMail: (opts: { to: string[]; subject: string; html: string }) => Promise<void>;
  dashboardUrl: string;
}

async function defaultDeps(): Promise<AlertDeps> {
  const [{ pool }, { automationService }, { Resend }] = await Promise.all([import('../db/pool.js'), import('../automation/automation.service.js'), import('resend')]);
  const key = process.env.RESEND_API_KEY;
  return {
    pool,
    ownerEmails: (id) => automationService.getOwnerNotificationEmails(id),
    sendMail: async ({ to, subject, html }) => {
      if (!key) throw new Error('RESEND_API_KEY is not set');
      const { throwIfRejected } = await import('../email-delivery.js');
      throwIfRejected(await new Resend(key).emails.send({ from: `Halla AI <${process.env.EMAIL_FROM || 'noreply@hallaai.com'}>`, to, subject, html, text: stripToPlainText(html) }));
    },
    dashboardUrl: (process.env.DASHBOARD_URL || process.env.PUBLIC_SITE_URL || 'https://hallaai.com').replace(/\/$/, ''),
  };
}

/** Alert emails are on unless the business turned them off (tenant metadata alert_emails = false). */
export async function alertEmailsEnabled(pool: Pick<Pool, 'query'>, tenantId: string): Promise<boolean> {
  const r = await pool.query("SELECT metadata->>'alert_emails' AS v FROM public.voice_tenants WHERE id = $1", [tenantId]);
  return String(r.rows[0]?.v ?? '').toLowerCase() !== 'false';
}

export function renderAlertEmail(a: AlertCandidate, dashboardUrl: string): { subject: string; html: string } {
  const subject = `${a.severity === 'critical' ? 'Action needed: ' : ''}${a.title}`;
  const bodyHtml =
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;">${escapeHtml(a.body)}</p>` +
    `<div dir="rtl" style="text-align:right;border-top:1px solid #e3e0d8;padding-top:14px;margin-top:6px"><p style="margin:0 0 6px;font-size:15px;font-weight:600;">${escapeHtml(a.titleAr)}</p><p style="margin:0;font-size:15px;line-height:1.7;">${escapeHtml(a.bodyAr)}</p></div>`;
  const html = renderBrandedEmail({ eyebrow: 'Alert', title: a.title, bodyHtml, ctaLabel: 'Open your dashboard', ctaUrl: `${dashboardUrl}${a.href}` });
  return { subject, html };
}

export async function raiseTenantAlert(tenantId: string, a: AlertCandidate, inject?: Partial<AlertDeps>): Promise<'created' | 'duplicate' | 'failed'> {
  try {
    const deps: AlertDeps = { ...(await defaultDeps()), ...inject };
    const row = await raiseAlert(deps.pool, tenantId, a);
    if (!row) return 'duplicate';
    if (a.severity === 'info') return 'created';
    try {
      if (!(await alertEmailsEnabled(deps.pool, tenantId))) return 'created';
      const to = await deps.ownerEmails(tenantId);
      if (to.length === 0) return 'created';
      const { subject, html } = renderAlertEmail(a, deps.dashboardUrl);
      await deps.sendMail({ to, subject, html });
      await markEmailed(deps.pool, tenantId, row.id);
    } catch (error) {
      logger.warn('[Alerts] The alert was saved but the email did not go out', { tenantId, kind: a.kind, error: error instanceof Error ? error.message : String(error) });
    }
    return 'created';
  } catch (error) {
    logger.warn('[Alerts] Could not raise an alert', { tenantId, kind: a.kind, error: error instanceof Error ? error.message : String(error) });
    return 'failed';
  }
}

/** A billing warning was just stored: show it to the owner as an alert too, if it is one worth showing. */
export async function raiseBillingWarningAlert(tenantId: string, w: BillingWarningInput, inject?: Partial<AlertDeps>): Promise<void> {
  const a = alertFromBillingWarning(w);
  if (a) await raiseTenantAlert(tenantId, a, inject);
}

/** A connected tool failed during a call or an action. Fire and forget. */
export async function raiseIntegrationFailureAlert(tenantId: string, provider: string, inject?: Partial<AlertDeps>): Promise<void> {
  if (!tenantId) return;
  await raiseTenantAlert(tenantId, alertFromIntegrationFailure(provider, new Date()), inject);
}
