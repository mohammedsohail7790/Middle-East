/**
 * Credential check for the model provider, without ever printing or returning the key.
 *
 * `classifyOpenAiResponse` turns an HTTP status and body into one of a small set of labels. `probeOpenAiKey` calls the free, read-only
 * "retrieve model" endpoint (GET /v1/models/{model}) with the key, which proves the key is accepted and the account can see the
 * model. It costs nothing and sends no audio, text or customer data.
 *
 * LIMIT (stated, not hidden): that endpoint does not consume quota, so a key whose credit is EXHAUSTED can still answer 200 here.
 * Exhausted credit is only visible on a billable request; the live gateway reports it as REALTIME_PROVIDER_CREDENTIAL_FAILURE
 * (code insufficient_quota) the first time a call hits it. `ok` therefore means "key accepted", never "credit available".
 */

export const PROBE_STATUS = Object.freeze({
  OK: 'ok',
  NO_KEY: 'no_key',
  INVALID_KEY: 'invalid_key',
  QUOTA_EXHAUSTED: 'quota_exhausted',
  RATE_LIMITED: 'rate_limited',
  MODEL_NOT_AVAILABLE: 'model_not_available',
  FORBIDDEN: 'forbidden',
  PROVIDER_UNAVAILABLE: 'provider_unavailable',
  UNEXPECTED: 'unexpected',
});

/** Pure: never receives or returns the key. `body` is the response text (may be empty). */
export function classifyOpenAiResponse(status, body = '') {
  let code = '';
  try {
    const parsed = JSON.parse(body);
    code = String(parsed?.error?.code ?? parsed?.error?.type ?? '');
  } catch {
    /* not JSON */
  }
  if (status >= 200 && status < 300) return PROBE_STATUS.OK;
  if (status === 401 || code === 'invalid_api_key') return PROBE_STATUS.INVALID_KEY;
  if (code === 'insufficient_quota' || code === 'billing_hard_limit_reached') return PROBE_STATUS.QUOTA_EXHAUSTED;
  if (status === 429) return PROBE_STATUS.RATE_LIMITED;
  if (status === 404 || code === 'model_not_found') return PROBE_STATUS.MODEL_NOT_AVAILABLE;
  if (status === 403) return PROBE_STATUS.FORBIDDEN;
  if (status >= 500 || status === 0) return PROBE_STATUS.PROVIDER_UNAVAILABLE;
  return PROBE_STATUS.UNEXPECTED;
}

/**
 * Probes the key. Returns `{ status, httpStatus }` only: no key, no header, no response body. A network failure or timeout is
 * `provider_unavailable`. `fetchImpl` is injectable for tests.
 */
export async function probeOpenAiKey({ key, model = 'gpt-realtime', fetchImpl = globalThis.fetch, timeoutMs = 15000, baseUrl = 'https://api.openai.com' } = {}) {
  if (!key || !String(key).trim()) return { status: PROBE_STATUS.NO_KEY, httpStatus: 0 };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${baseUrl}/v1/models/${encodeURIComponent(model)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${String(key).trim()}` },
      signal: controller.signal,
    });
    const text = await res.text().catch(() => '');
    return { status: classifyOpenAiResponse(res.status, text), httpStatus: res.status };
  } catch {
    return { status: PROBE_STATUS.PROVIDER_UNAVAILABLE, httpStatus: 0 };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One minimal BILLABLE model request: opens a Realtime session (text output only, no audio, no customer data), asks for one word and
 * waits for the model to finish. Unlike `probeOpenAiKey`, this proves the model actually answers and that credit/quota is usable.
 * Returns `{ status, httpStatus, responded }` only: never the key, a header or the model's text (`responded` = a completed response
 * with some text came back). A handshake rejection is classified by its HTTP status; an in-session error by its provider code.
 * `wsFactory(url, options)` is injectable for tests; the default uses the `ws` package.
 */
export async function probeRealtimeResponse({ key, model = 'gpt-realtime', wsFactory, timeoutMs = 30000, baseUrl = 'wss://api.openai.com' } = {}) {
  if (!key || !String(key).trim()) return { status: PROBE_STATUS.NO_KEY, httpStatus: 0, responded: false };
  const make = wsFactory ?? (async (url, options) => new (await import('ws')).default(url, options));
  const ws = await make(`${baseUrl}/v1/realtime?model=${encodeURIComponent(model)}`, { headers: { Authorization: `Bearer ${String(key).trim()}` } });
  return await new Promise((resolve) => {
    let done = false;
    let sawText = false;
    const finish = (status, httpStatus = 0) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* already closed */ }
      resolve({ status, httpStatus, responded: status === PROBE_STATUS.OK && sawText });
    };
    const timer = setTimeout(() => finish(PROBE_STATUS.PROVIDER_UNAVAILABLE), timeoutMs);
    const send = (m) => ws.send(JSON.stringify(m));
    ws.on('unexpected-response', (_req, res) => finish(classifyOpenAiResponse(res?.statusCode ?? 0, ''), res?.statusCode ?? 0));
    ws.on('error', () => finish(PROBE_STATUS.PROVIDER_UNAVAILABLE));
    ws.on('close', () => finish(PROBE_STATUS.PROVIDER_UNAVAILABLE));
    ws.on('message', (raw) => {
      let ev;
      try { ev = JSON.parse(String(raw)); } catch { return; }
      if (ev.type === 'session.created') {
        send({ type: 'response.create', response: { output_modalities: ['text'], instructions: 'Reply with the single word OK.' } });
      } else if (ev.type === 'response.output_text.delta' || ev.type === 'response.text.delta') {
        sawText = true;
      } else if (ev.type === 'response.done') {
        const r = ev.response ?? {};
        if (r.status === 'completed') {
          if (!sawText && JSON.stringify(r.output ?? []).includes('"text"')) sawText = true;
          finish(sawText ? PROBE_STATUS.OK : PROBE_STATUS.UNEXPECTED, 200);
        } else {
          finish(classifyOpenAiResponse(0, JSON.stringify({ error: r.status_details?.error ?? {} })).replace(PROBE_STATUS.PROVIDER_UNAVAILABLE, PROBE_STATUS.UNEXPECTED));
        }
      } else if (ev.type === 'error') {
        const code = String(ev.error?.code ?? ev.error?.type ?? '');
        const s = classifyOpenAiResponse(0, JSON.stringify({ error: { code } }));
        finish(s === PROBE_STATUS.PROVIDER_UNAVAILABLE ? PROBE_STATUS.UNEXPECTED : s);
      }
    });
  });
}
