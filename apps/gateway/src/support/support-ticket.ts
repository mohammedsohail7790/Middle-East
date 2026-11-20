import { Resend } from 'resend';
import { logger } from '../services/logger.js';
import { throwIfRejected } from '../services/email-delivery.js';
import { escapeHtml, renderBrandedEmail, stripToPlainText } from '../services/automation/email-template.js';

/**
 * A support ticket from a signed-in client, emailed to the team. Nothing is stored: the email is the record.
 * The rules (what is valid, how often) are kept apart from the email code so they can be tested without sending anything.
 */
export const TICKET_HOURLY_LIMIT = 3;
const HOUR_MS = 60 * 60 * 1000;
export const MAX_SUBJECT = 200;
export const MAX_MESSAGE = 5000;

export type TicketInput = { email: string; subject: string; message: string };
export type TicketCheck = { ok: boolean; ticket?: TicketInput; error?: string };

export function validateTicket(body: unknown): TicketCheck {
  const b = (body ?? {}) as Record<string, unknown>;
  const email = String(b.email ?? '').trim();
  const subject = String(b.subject ?? '').trim();
  const message = String(b.message ?? '').trim();
  if (!subject || !message || !email) return { ok: false, error: 'Email, subject and message are all required.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { ok: false, error: 'Enter a valid email address.' };
  if (subject.length > MAX_SUBJECT) return { ok: false, error: `The subject must be at most ${MAX_SUBJECT} characters.` };
  if (message.length > MAX_MESSAGE) return { ok: false, error: `The message must be at most ${MAX_MESSAGE} characters.` };
  // A line break in the subject could be used to add email headers.
  return { ok: true, ticket: { email, subject: subject.replace(/[\r\n]+/g, ' '), message } };
}

/** Times (ms) of this workspace's earlier tickets: whether another is allowed now. */
export function checkTicketAllowed(history: readonly number[], now: number): { allowed: boolean; message?: string } {
  const recent = history.filter((t) => now - t < HOUR_MS);
  if (recent.length >= TICKET_HOURLY_LIMIT) {
    const wait = Math.ceil((HOUR_MS - (now - Math.min(...recent))) / 60_000);
    return { allowed: false, message: `You have sent ${TICKET_HOURLY_LIMIT} messages this hour. Try again in about ${wait} minutes, or email us directly.` };
  }
  return { allowed: true };
}

export function ticketRecipients(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.SUPPORT_TICKET_EMAILS || 'hello@hallaai.com')
    .split(',')
    .map((a) => a.trim())
    .filter((a) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a));
}

export interface TicketMailDeps {
  send: (opts: { to: string[]; replyTo: string; subject: string; html: string }) => Promise<void>;
  recipients: () => string[];
}

async function defaultSend({ to, replyTo, subject, html }: { to: string[]; replyTo: string; subject: string; html: string }): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  throwIfRejected(await new Resend(key).emails.send({ from: `Halla AI <${process.env.EMAIL_FROM || 'noreply@hallaai.com'}>`, to, replyTo, subject, html, text: stripToPlainText(html) }));
}

/** Email the ticket to the team only. Replies go to the client. Returns false (never throws) when it could not be sent. */
export async function sendSupportTicket(
  ticket: TicketInput,
  who: { workspace?: string; tenantId: string },
  inject?: Partial<TicketMailDeps>,
): Promise<boolean> {
  try {
    const deps: TicketMailDeps = { send: defaultSend, recipients: () => ticketRecipients(), ...inject };
    const to = deps.recipients();
    if (to.length === 0) return false;
    const html = renderBrandedEmail({
      eyebrow: 'Support ticket',
      title: ticket.subject,
      bodyHtml:
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(ticket.message)}</p>` +
        `<p style="margin:0;font-size:13px;line-height:1.6;color:#6b675e;">From: ${escapeHtml(ticket.email)}<br>Workspace: ${escapeHtml(who.workspace || 'unknown')} (${escapeHtml(who.tenantId)})</p>`,
    });
    await deps.send({ to, replyTo: ticket.email, subject: `Support ticket: ${ticket.subject}`, html });
    return true;
  } catch (error) {
    logger.warn('[Support] Could not send a support ticket', { error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}
