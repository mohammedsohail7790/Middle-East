import type { ExecutorContext, ExecutorResult } from '../types.js';
import { EMAIL, oneLine, requireApproval, text } from './util.js';

/** The addresses the receptionist already emails: the owner and the active team. */
export async function teamEmails(tenantId: string): Promise<string[]> {
  const { automationService } = await import('../../automation/automation.service.js');
  return automationService.getOwnerNotificationEmails(tenantId);
}

/** Plain text in, safe branded HTML out: every value is escaped, line breaks kept. */
export async function renderPlainEmail(title: string, body: string): Promise<string> {
  const { escapeHtml, renderBrandedEmail } = await import('../../automation/email-template.js');
  const bodyHtml = escapeHtml(body)
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('');
  return renderBrandedEmail({ title: escapeHtml(title), bodyHtml });
}

/** Sends one email with the existing mail helper; it throws when the provider refuses, so a refusal is a failed step and not a silent success. */
export async function deliver(to: string, subject: string, html: string): Promise<void> {
  const { automationService } = await import('../../automation/automation.service.js');
  await automationService.deliverEmail(to, subject, html);
}

/** email.send: params { to: 'team' | 'customer' | an address, subject, body }. 'customer' is the lead's own email address from the trigger. */
export async function emailSend(ctx: ExecutorContext): Promise<ExecutorResult> {
  requireApproval(ctx);
  const subject = oneLine(text(ctx.params.subject, 300)) || 'A message from Halla AI';
  const body = text(ctx.params.body, 5_000);
  if (!body) return { summary: 'There was nothing to say, so no email was sent', skipped: true };
  const to = text(ctx.params.to, 200).toLowerCase();

  let recipients: string[];
  if (to === 'team' || to === '') {
    recipients = (await teamEmails(ctx.tenantId)).filter((e) => EMAIL.test(e));
    if (!recipients.length) return { summary: 'No team email address is set up', skipped: true };
  } else if (to === 'customer') {
    const trigger = (ctx.data.trigger ?? {}) as Record<string, unknown>;
    const addr = text(ctx.params.customerEmail || trigger.email, 200).toLowerCase();
    if (!EMAIL.test(addr)) return { summary: 'The lead has no email address', skipped: true };
    recipients = [addr];
  } else if (EMAIL.test(to)) {
    recipients = [to];
  } else {
    return { summary: 'There is no valid email address to send to', skipped: true };
  }

  const html = await renderPlainEmail(subject, body);
  let sent = 0;
  let lastError: unknown;
  for (const r of recipients) {
    try {
      await deliver(r, subject, html);
      sent++;
    } catch (e) {
      lastError = e;
    }
  }
  if (!sent) throw lastError instanceof Error ? lastError : new Error('The email could not be sent');
  return { summary: sent === 1 ? 'Sent the email' : `Sent the email to ${sent} people`, output: { sent } };
}
