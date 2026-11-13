import type { ExecutorContext, ExecutorResult } from '../types.js';
import { isObject, requireApproval, text } from './util.js';

/** webhook.post: params { url, body, ...extra }. HTTPS only, address checked against private and internal ranges, no redirects, 10 seconds. */
export async function webhookPost(ctx: ExecutorContext): Promise<ExecutorResult> {
  requireApproval(ctx);
  const { url: rawUrl, body, headers: _headers, ...extra } = ctx.params;
  void _headers;
  const url = text(rawUrl, 2_000);
  if (!url) return { summary: 'No web address is set', skipped: true };

  const payload: Record<string, unknown> = isObject(body) ? { ...extra, ...body } : { ...extra, ...(body !== undefined && body !== '' ? { body } : {}) };
  const json = JSON.stringify(payload);
  if (json.length > 100_000) throw new Error('The data to send is too large');

  const { assertSafeWebhookUrl } = await import('../../../security/ssrf-guard.js');
  const { safePostJson } = await import('../../../security/safe-http.js');
  const target = await assertSafeWebhookUrl(url); // https only; refuses private, internal and unresolvable addresses
  const res = await safePostJson(target.url, target.addresses, { headers: { 'Content-Type': 'application/json' }, body: json, timeoutMs: 10_000 });
  if (res.status < 200 || res.status >= 300) throw new Error(`The web address answered with status ${res.status}`);
  return { summary: 'Sent the details to your web address', output: { status: res.status } };
}
