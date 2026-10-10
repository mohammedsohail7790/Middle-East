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
