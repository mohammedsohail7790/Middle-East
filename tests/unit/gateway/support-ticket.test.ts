import { describe, expect, it, vi } from 'vitest';
import {
  MAX_MESSAGE,
  MAX_SUBJECT,
  TICKET_HOURLY_LIMIT,
  checkTicketAllowed,
  sendSupportTicket,
  ticketRecipients,
  validateTicket,
} from '../../../apps/gateway/src/support/support-ticket.js';

const good = { email: 'client@clinic.com', subject: 'Calls not answered', message: 'Since Monday the line rings out.' };

describe('validateTicket', () => {
  it('accepts a complete ticket and trims it', () => {
    const r = validateTicket({ email: ' client@clinic.com ', subject: ' Hi ', message: ' Hello ' });
    expect(r).toEqual({ ok: true, ticket: { email: 'client@clinic.com', subject: 'Hi', message: 'Hello' } });
  });
  it('needs email, subject and message', () => {
    for (const missing of ['email', 'subject', 'message']) {
      expect(validateTicket({ ...good, [missing]: '  ' }).ok).toBe(false);
    }
    expect(validateTicket(undefined).ok).toBe(false);
  });
  it('rejects an invalid email address', () => {
    expect(validateTicket({ ...good, email: 'not-an-email' }).ok).toBe(false);
  });
  it('rejects a subject or message that is too long', () => {
    expect(validateTicket({ ...good, subject: 'x'.repeat(MAX_SUBJECT + 1) }).ok).toBe(false);
    expect(validateTicket({ ...good, message: 'x'.repeat(MAX_MESSAGE + 1) }).ok).toBe(false);
  });
  it('turns line breaks in the subject into spaces so no email header can be added', () => {
    const r = validateTicket({ ...good, subject: 'Hi\r\nBcc: someone@evil.com' });
    expect(r.ticket?.subject).toBe('Hi Bcc: someone@evil.com');
  });
});

describe('checkTicketAllowed', () => {
  const now = 10_000_000;
  it('allows the first tickets and blocks after the hourly limit', () => {
    expect(checkTicketAllowed([], now).allowed).toBe(true);
    expect(checkTicketAllowed([now - 1000, now - 2000], now).allowed).toBe(true);
    const blocked = checkTicketAllowed(Array.from({ length: TICKET_HOURLY_LIMIT }, (_, i) => now - 1000 * (i + 1)), now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.message).toContain('email us directly');
  });
  it('lets tickets older than an hour drop out', () => {
    expect(checkTicketAllowed([now - 4_000_000, now - 4_100_000, now - 4_200_000], now).allowed).toBe(true);
  });
});

describe('ticketRecipients', () => {
  it('uses SUPPORT_TICKET_EMAILS, else the team inbox, and drops bad addresses', () => {
    expect(ticketRecipients({ SUPPORT_TICKET_EMAILS: 'a@x.com, b@x.com' } as any)).toEqual(['a@x.com', 'b@x.com']);
    expect(ticketRecipients({} as any)).toEqual(['hello@hallaai.com']);
    expect(ticketRecipients({ SUPPORT_TICKET_EMAILS: 'nope, a@x.com' } as any)).toEqual(['a@x.com']);
  });
});

describe('sendSupportTicket', () => {
  const who = { workspace: 'Glow Clinic', tenantId: 'abc-123' };
  it('emails the team only, with replies going to the client', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    expect(await sendSupportTicket(good, who, { send, recipients: () => ['hello@hallaai.com'] })).toBe(true);
    const mail = send.mock.calls[0][0];
    expect(mail.to).toEqual(['hello@hallaai.com']);
    expect(mail.replyTo).toBe('client@clinic.com');
    expect(mail.subject).toBe('Support ticket: Calls not answered');
    expect(mail.html).toContain('Glow Clinic');
    expect(mail.html).toContain('abc-123');
  });
  it('never puts the client address in the recipient list', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await sendSupportTicket(good, who, { send, recipients: () => ['hello@hallaai.com'] });
    expect(send.mock.calls[0][0].to).not.toContain('client@clinic.com');
  });
  it('escapes what the client typed', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await sendSupportTicket({ ...good, subject: '<b>x</b>', message: '<script>alert(1)</script>' }, who, { send, recipients: () => ['hello@hallaai.com'] });
    const html: string = send.mock.calls[0][0].html;
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
  it('returns false instead of throwing when sending fails or there is nowhere to send', async () => {
    expect(await sendSupportTicket(good, who, { send: vi.fn().mockRejectedValue(new Error('down')), recipients: () => ['hello@hallaai.com'] })).toBe(false);
    const send = vi.fn();
    expect(await sendSupportTicket(good, who, { send, recipients: () => [] })).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});
