import { Resend } from 'resend';
import { throwIfRejected } from '../email-delivery.js';
import { renderBrandedEmail, stripToPlainText } from '../automation/email-template.js';

/**
 * Mail to a client of the paid audit: the questionnaire link, the payment link and the confirmations. These are the only audit emails that go to the client; everything
 * else (answers, payments) goes to our own addresses through audit-mail.ts. Replies go to the team address.
 */
const REPLY_TO = process.env.AUDIT_REPLY_TO || 'hello@hallaai.com';

export async function sendClientAuditMail(opts: {
  to: string;
  eyebrow: string;
  title: string;
  subject: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  preheader?: string;
  /** Files to attach, for example the audit PDF. */
  attachments?: Array<{ filename: string; content: Buffer }>;
  /** Right-to-left layout for Arabic text. */
  rtl?: boolean;
}): Promise<'sent' | 'not-configured'> {
  if (!process.env.RESEND_API_KEY) return 'not-configured';
  const resend = new Resend(process.env.RESEND_API_KEY);
  const html = renderBrandedEmail({
    eyebrow: opts.eyebrow,
    title: opts.title,
    bodyHtml: opts.bodyHtml,
    ctaLabel: opts.ctaLabel,
    ctaUrl: opts.ctaUrl,
    preheader: opts.preheader,
  });
  throwIfRejected(await resend.emails.send({
    from: `Halla AI <${process.env.EMAIL_FROM || 'noreply@hallaai.com'}>`,
    to: [opts.to],
    replyTo: REPLY_TO,
    subject: opts.subject,
    html: opts.rtl ? html.replace('<body', '<body dir="rtl"') : html,
    text: stripToPlainText(html),
    ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
  }));
  return 'sent';
}

/** A short paragraph for the email body. The text must already be safe (no user input), like everything passed to renderBrandedEmail. */
export const para = (text: string): string => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;">${text}</p>`;
