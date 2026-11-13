import type { ExecutorContext, ExecutorResult } from '../types.js';
import { deliver, renderPlainEmail, teamEmails } from './email-send.js';
import { EMAIL, oneLine, requireApproval, text } from './util.js';

const slackEscape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function postToSlack(tenantId: string, title: string, message: string): Promise<'sent' | 'none'> {
  const { slackService } = await import('../../slack/slack.service.js');
  const conn = await slackService.getConnection(tenantId);
  if (!conn || !conn.enabled || !conn.webhookUrl) return 'none';
  const { assertSafeWebhookUrl } = await import('../../../security/ssrf-guard.js');
  const { safePostJson } = await import('../../../security/safe-http.js');
  const target = await assertSafeWebhookUrl(conn.webhookUrl);
  const res = await safePostJson(target.url, target.addresses, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: `*${slackEscape(title)}*\n${slackEscape(message)}` }),
    timeoutMs: 10_000,
  });
  if (res.status < 200 || res.status >= 300) throw new Error(`Slack answered with status ${res.status}`);
  return 'sent';
}

/** notify.team: the team email, plus Slack when it is connected. params { title, message }. */
export async function notifyTeam(ctx: ExecutorContext): Promise<ExecutorResult> {
  requireApproval(ctx);
  const title = oneLine(text(ctx.params.title, 200)) || 'Update from Halla AI';
  const message = text(ctx.params.message, 3_000);
  if (!message) return { summary: 'There was nothing to tell the team', skipped: true };

  const channels: string[] = [];
  let failure: unknown;
  const recipients = (await teamEmails(ctx.tenantId).catch(() => [])).filter((e) => EMAIL.test(e));
  if (recipients.length) {
    const html = await renderPlainEmail(title, message);
    let ok = 0;
    for (const r of recipients) {
      try {
        await deliver(r, title, html);
        ok++;
      } catch (e) {
        failure = e;
      }
    }
    if (ok) channels.push('email');
  }
  try {
    if ((await postToSlack(ctx.tenantId, title, message)) === 'sent') channels.push('Slack');
  } catch (e) {
    failure = failure ?? e;
  }
  if (!channels.length) {
    if (failure) throw failure instanceof Error ? failure : new Error('The team could not be reached');
    return { summary: 'No team email or Slack is set up', skipped: true };
  }
  return { summary: `Told your team by ${channels.join(' and ')}`, output: { channels } };
}
