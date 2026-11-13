/** Each executor with its collaborators mocked: nothing real is called. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  listConnections: vi.fn(), voiceQuery: vi.fn(), sendRealtime: vi.fn(), getOwnerEmails: vi.fn(), deliverEmail: vi.fn(),
  isConsent: vi.fn(), findConv: vi.fn(), isWindowOpen: vi.fn(), sendReply: vi.fn(), sendSms: vi.fn(), slackConn: vi.fn(), safePost: vi.fn(),
}));
vi.mock('../../apps/gateway/src/services/integrations/connection-store.service.js', () => ({ connectionStore: { listConnections: m.listConnections } }));
vi.mock('../../apps/gateway/src/services/voice/tenant-scope.js', () => ({ voiceDb: { query: m.voiceQuery } }));
vi.mock('../../apps/gateway/src/services/integrations/integration.service.js', () => ({ integrationService: { sendRealtime: m.sendRealtime } }));
vi.mock('../../apps/gateway/src/services/automation/automation.service.js', () => ({ automationService: { getOwnerNotificationEmails: m.getOwnerEmails, deliverEmail: m.deliverEmail } }));
vi.mock('../../apps/gateway/src/services/whatsapp/whatsapp.outbound.js', () => ({ isConsentCaptureTenant: m.isConsent, isWindowOpen: m.isWindowOpen, sendReply: m.sendReply }));
vi.mock('../../apps/gateway/src/services/whatsapp/whatsapp.store.js', () => ({ whatsappStore: { findConversationByPhone: m.findConv } }));
vi.mock('../../apps/gateway/src/services/sms/sms.service.js', () => ({ smsService: { sendSms: m.sendSms } }));
vi.mock('../../apps/gateway/src/services/slack/slack.service.js', () => ({ slackService: { getConnection: m.slackConn } }));
vi.mock('../../apps/gateway/src/security/safe-http.js', () => ({ safePostJson: m.safePost }));
// the real SSRF guard is used, with name lookups answered locally
vi.mock('node:dns/promises', async (orig) => ({ ...(await orig<typeof import('node:dns/promises')>()), lookup: vi.fn(async (h: string) => (h === 'internal.example.com' ? [{ address: '10.0.0.5', family: 4 }] : [{ address: '93.184.216.34', family: 4 }])) }));

import { crmPushLead } from '../../apps/gateway/src/services/automation-engine/executors/crm-push-lead.js';
import { emailSend } from '../../apps/gateway/src/services/automation-engine/executors/email-send.js';
import { messageSend } from '../../apps/gateway/src/services/automation-engine/executors/message-send.js';
import { notifyTeam } from '../../apps/gateway/src/services/automation-engine/executors/notify-team.js';
import { webhookPost } from '../../apps/gateway/src/services/automation-engine/executors/webhook-post.js';
import { dataTransform } from '../../apps/gateway/src/services/automation-engine/executors/data-transform.js';
import { registerAllExecutors } from '../../apps/gateway/src/services/automation-engine/executors/index.js';
import { getExecutor, resetRegistry } from '../../apps/gateway/src/services/automation-engine/registry.js';
import type { ExecutorContext } from '../../apps/gateway/src/services/automation-engine/types.js';

const ctx = (params: Record<string, unknown>, extra: Partial<ExecutorContext> = {}, data: Record<string, unknown> = {}): ExecutorContext => ({
  tenantId: 'T', automation: {} as any, runId: 'run1', step: { key: 's', kind: 'data.transform', title: 't', external: true }, params, data: { trigger: {}, config: {}, steps: {}, ...data }, approved: true, ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.isConsent.mockResolvedValue(false);
  m.getOwnerEmails.mockResolvedValue(['owner@biz.co', 'team@biz.co']);
  m.deliverEmail.mockResolvedValue(undefined);
  m.slackConn.mockResolvedValue(null);
  m.safePost.mockResolvedValue({ status: 200, body: '' });
  m.findConv.mockResolvedValue(null);
  m.isWindowOpen.mockReturnValue(true);
});

describe('every external executor refuses without approval', () => {
  it.each([[crmPushLead, { name: 'a' }], [emailSend, { to: 'team', body: 'x' }], [messageSend, { to: '+971501234567', text: 'x' }], [notifyTeam, { message: 'x' }], [webhookPost, { url: 'https://example.com/h' }]] as const)('%o', async (fn, params) => {
    await expect(fn(ctx({ ...params }, { approved: false }))).rejects.toThrow(/approval/);
  });
  it('and nothing was sent', () => {
    expect(m.sendRealtime).not.toHaveBeenCalled();
    expect(m.deliverEmail).not.toHaveBeenCalled();
    expect(m.safePost).not.toHaveBeenCalled();
  });
});

describe('crm.push_lead', () => {
  it('skips with "No CRM is connected" when nothing is connected', async () => {
    m.listConnections.mockResolvedValue([{ integration_id: 'hubspot', status: 'disconnected' }]);
    m.voiceQuery.mockResolvedValue({ rows: [{ connected: false }] });
    expect(await crmPushLead(ctx({ name: 'Sam', phone: '+1' }))).toMatchObject({ skipped: true, summary: 'No CRM is connected' });
    expect(m.sendRealtime).not.toHaveBeenCalled();
  });
  it('sends through the existing dispatcher when a CRM is connected', async () => {
    m.listConnections.mockResolvedValue([{ integration_id: 'hubspot', status: 'connected' }]);
    const r = await crmPushLead(ctx({ name: 'Sam', phone: '+971500000000', email: 's@x.co', source: 'web', score: 80, tag: 'Halla' }));
    expect(r.skipped).toBeUndefined();
    expect(m.sendRealtime).toHaveBeenCalledWith('T', expect.objectContaining({ type: 'lead', lead: expect.objectContaining({ name: 'Sam', phone: '+971500000000', email: 's@x.co', notes: 'Source: web. Score: 80. Tag: Halla' }) }));
  });
  it('also counts the older HubSpot switch', async () => {
    m.listConnections.mockResolvedValue([]);
    m.voiceQuery.mockResolvedValue({ rows: [{ connected: true }] });
    await crmPushLead(ctx({ name: 'Sam' }));
    expect(m.sendRealtime).toHaveBeenCalled();
  });
});

describe('email.send', () => {
  it('sends to the team with escaped values', async () => {
    const r = await emailSend(ctx({ to: 'team', subject: 'Hi\r\nBcc: evil@x.co', body: 'Name: <script>alert(1)</script>' }));
    expect(r.summary).toMatch(/2 people/);
    const [, subject, html] = m.deliverEmail.mock.calls[0];
    expect(subject).not.toMatch(/[\r\n]/);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert');
  });
  it('sends to the customer from the trigger, or skips without an address', async () => {
    await emailSend(ctx({ to: 'customer', body: 'Thanks' }, {}, { trigger: { email: 'c@x.co' } }));
    expect(m.deliverEmail.mock.calls[0][0]).toBe('c@x.co');
    expect(await emailSend(ctx({ to: 'customer', body: 'Thanks' }))).toMatchObject({ skipped: true });
  });
  it('accepts an address from the settings and refuses junk; skips when the team has no address', async () => {
    await emailSend(ctx({ to: 'me@biz.co', body: 'x' }));
    expect(m.deliverEmail.mock.calls[0][0]).toBe('me@biz.co');
    expect(await emailSend(ctx({ to: 'not an email', body: 'x' }))).toMatchObject({ skipped: true });
    m.getOwnerEmails.mockResolvedValue([]);
    expect(await emailSend(ctx({ to: 'team', body: 'x' }))).toMatchObject({ skipped: true });
  });
  it('fails (not silently succeeds) when the provider refuses', async () => {
    m.deliverEmail.mockRejectedValue(new Error('Resend refused'));
    await expect(emailSend(ctx({ to: 'team', body: 'x' }))).rejects.toThrow();
  });
});

describe('message.send', () => {
  const conv = (o: object = {}) => ({ id: 'c1', optedOut: false, lastInboundAt: new Date().toISOString(), ...o });
  const p = { to: '+971 50 123 4567', text: 'Sorry we missed you', senderName: 'Al Noor', channelOrder: ['whatsapp', 'sms'] };
  it('never messages a number that opted out, on any channel', async () => {
    m.findConv.mockResolvedValue(conv({ optedOut: true }));
    expect(await messageSend(ctx(p))).toMatchObject({ skipped: true });
    expect(m.sendReply).not.toHaveBeenCalled();
    expect(m.sendSms).not.toHaveBeenCalled();
  });
  it('stays out of consent-capture businesses', async () => {
    m.isConsent.mockResolvedValue(true);
    expect(await messageSend(ctx(p))).toMatchObject({ skipped: true });
    expect(m.sendSms).not.toHaveBeenCalled();
  });
  it('uses WhatsApp inside the 24-hour window, with the sender name', async () => {
    m.findConv.mockResolvedValue(conv());
    m.sendReply.mockResolvedValue({ ok: true });
    expect(await messageSend(ctx(p))).toMatchObject({ output: { channel: 'whatsapp' } });
    expect(m.sendReply.mock.calls[0][2]).toBe('Sorry we missed you\n- Al Noor');
    expect(m.sendSms).not.toHaveBeenCalled();
  });
  it('falls back to SMS when the WhatsApp window is closed or there is no conversation', async () => {
    m.sendSms.mockResolvedValue({});
    m.findConv.mockResolvedValue(conv());
    m.isWindowOpen.mockReturnValue(false);
    expect(await messageSend(ctx(p))).toMatchObject({ output: { channel: 'sms' } });
    m.findConv.mockResolvedValue(null);
    expect(await messageSend(ctx(p))).toMatchObject({ output: { channel: 'sms' } });
    expect(m.sendReply).not.toHaveBeenCalled();
  });
  it('skips (no free text) when only WhatsApp is allowed and the window is closed', async () => {
    m.findConv.mockResolvedValue(conv());
    m.isWindowOpen.mockReturnValue(false);
    expect(await messageSend(ctx({ ...p, channelOrder: ['whatsapp'] }))).toMatchObject({ skipped: true });
  });
  it('fails when SMS cannot be sent, and skips a bad phone number', async () => {
    m.sendSms.mockRejectedValue(new Error('No active subscription'));
    await expect(messageSend(ctx({ ...p, channelOrder: ['sms'] }))).rejects.toThrow(/could not be sent/);
    expect(await messageSend(ctx({ ...p, to: 'abc' }))).toMatchObject({ skipped: true });
  });
});

describe('notify.team', () => {
  it('emails the team and posts to Slack when connected', async () => {
    m.slackConn.mockResolvedValue({ enabled: true, webhookUrl: 'https://hooks.slack.com/services/x' });
    const r = await notifyTeam(ctx({ title: 'New lead', message: 'Hello <b>' }));
    expect(r.summary).toBe('Told your team by email and Slack');
    expect(JSON.parse(m.safePost.mock.calls[0][2].body).text).toContain('&lt;b&gt;');
  });
  it('skips when no email and no Slack', async () => {
    m.getOwnerEmails.mockResolvedValue([]);
    expect(await notifyTeam(ctx({ message: 'x' }))).toMatchObject({ skipped: true });
  });
});

describe('webhook.post', () => {
  it('posts JSON to a public https address with a 10 second limit', async () => {
    const r = await webhookPost(ctx({ url: 'https://hooks.example.com/abc', body: { name: 'Sam' }, fileName: 'a.pdf' }));
    expect(r.summary).toMatch(/Sent/);
    const [, addresses, opts] = m.safePost.mock.calls[0];
    expect(addresses).toEqual(['93.184.216.34']);
    expect(opts.timeoutMs).toBe(10_000);
    expect(JSON.parse(opts.body)).toEqual({ fileName: 'a.pdf', name: 'Sam' });
  });
  it.each(['http://example.com/h', 'https://10.0.0.1/h', 'https://127.0.0.1/h', 'https://169.254.169.254/latest', 'https://internal.example.com/h', 'ftp://example.com'])('refuses %s', async (url) => {
    await expect(webhookPost(ctx({ url, body: {} }))).rejects.toThrow();
    expect(m.safePost).not.toHaveBeenCalled();
  });
  it('fails on a non-2xx answer and skips when no address is set', async () => {
    m.safePost.mockResolvedValue({ status: 500, body: '' });
    await expect(webhookPost(ctx({ url: 'https://hooks.example.com/abc', body: {} }))).rejects.toThrow(/500/);
    expect(await webhookPost(ctx({ url: '' }))).toMatchObject({ skipped: true });
  });
});

describe('data.transform', () => {
  it('min-score', async () => {
    expect((await dataTransform(ctx({ mode: 'min-score', score: 82, minScore: 70 }))).output).toEqual({ belowMinimum: false, score: 82 });
    expect((await dataTransform(ctx({ mode: 'min-score', score: '40', minScore: '70' }))).output).toEqual({ belowMinimum: true, score: 40 });
    expect((await dataTransform(ctx({ mode: 'min-score', score: '', minScore: 70 }))).output).toEqual({ belowMinimum: true, score: null });
  });
  it('copies, joins and formats by path without evaluating anything', async () => {
    const r = await dataTransform(ctx({
      copy: { who: 'trigger.name' }, join: { full: { parts: ['trigger.first', 'trigger.last'], separator: ' ' } }, format: { tel: { path: 'trigger.phone', as: 'phone' }, shout: { path: 'trigger.first', as: 'uppercase' } },
    }, {}, { trigger: { name: 'Sam', first: 'Sam', last: 'Lee', phone: '(971) 50-123 4567' } }));
    expect(r.output).toEqual({ who: 'Sam', full: 'Sam Lee', tel: '+971501234567', shout: 'SAM' });
  });
});

describe('registration', () => {
  it('registers every kind, and leaves document.extract to its own executor', () => {
    resetRegistry();
    registerAllExecutors();
    for (const k of ['crm.push_lead', 'email.send', 'message.send', 'notify.team', 'webhook.post', 'data.transform', 'document.extract'] as const) expect(getExecutor(k)).toBeTypeOf('function');
  });
});
