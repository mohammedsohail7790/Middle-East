import { Resend } from 'resend';
import { renderBrandedEmail, stripToPlainText } from '../automation/email-template.js';

/**
 * Mail to ourselves about the audit: a Form 2 submission, or a payment. It goes to AUDIT_LEAD_EMAILS (one or more addresses, comma separated), falling back to the fit-check
 * list and then to the diagnostic-call address, so Hk and the owner both receive it. Nothing here is sent to a client.
 */
export function auditRecipients(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.AUDIT_LEAD_EMAILS || env.FIT_CHECK_LEAD_EMAILS || env.CONSULT_LEAD_EMAIL || 'hello@hallaai.com')
    .split(',')
    .map((a) => a.trim())
    .filter((a) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a));
}

export async function sendAuditMail(opts: { eyebrow: string; title: string; subject: string; bodyHtml: string; replyTo?: string }): Promise<'sent' | 'not-configured'> {
  if (!process.env.RESEND_API_KEY) return 'not-configured';
  const resend = new Resend(process.env.RESEND_API_KEY);
  const html = renderBrandedEmail({ eyebrow: opts.eyebrow, title: opts.title, bodyHtml: opts.bodyHtml });
  await resend.emails.send({
    from: `Halla AI <${process.env.EMAIL_FROM || 'noreply@hallaai.com'}>`,
    to: auditRecipients(),
    replyTo: opts.replyTo,
    subject: opts.subject,
    html,
    text: stripToPlainText(html),
  });
  return 'sent';
}
