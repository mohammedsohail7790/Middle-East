/**
 * Production / staging smoke test for Call IQ gateway + realtime path.
 *
 * Usage:
 *   node scripts/smoke-production.mjs
 *
 * Env (repo root, apps/gateway/.env, or .env.e2e):
 *   SMOKE_GATEWAY_URL          — default: NEXT_PUBLIC_GATEWAY_API_URL or Render URL
 *   SMOKE_SUPABASE_URL         — or NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL
 *   SMOKE_SUPABASE_ANON_KEY    — or NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   SMOKE_TEST_EMAIL           — or E2E_TEST_EMAIL (optional; enables JWT checks)
 *   SMOKE_TEST_PASSWORD        — or E2E_TEST_PASSWORD
 *   SMOKE_TENANT_ID            — or E2E_TENANT_ID (optional hint for SSE query)
 *   VOICE_INTERNAL_API_KEY     — optional internal API checks
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

config({ path: resolve(root, 'apps/gateway/.env') });
config({ path: resolve(root, '.env.e2e') });
config({ path: resolve(root, '.env.local') });

const GATEWAY = (
  process.env.SMOKE_GATEWAY_URL ||
  process.env.NEXT_PUBLIC_GATEWAY_API_URL ||
  process.env.PLAYWRIGHT_GATEWAY_URL ||
  'https://call-iq-gateway.onrender.com'
).replace(/\/$/, '');

const SUPABASE_URL = (
  process.env.SMOKE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  ''
).replace(/\/$/, '');

const SUPABASE_ANON = process.env.SMOKE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const EMAIL = process.env.SMOKE_TEST_EMAIL || process.env.E2E_TEST_EMAIL || '';
const PASSWORD = process.env.SMOKE_TEST_PASSWORD || process.env.E2E_TEST_PASSWORD || '';
const TENANT_HINT = process.env.SMOKE_TENANT_ID || process.env.E2E_TENANT_ID || '';
const INTERNAL_KEY = process.env.VOICE_INTERNAL_API_KEY || '';

let failed = 0;

function pass(step, detail = '') {
  console.log(`[PASS] ${step}${detail ? ` — ${detail}` : ''}`);
}

function fail(step, detail = '') {
  failed += 1;
  console.log(`[FAIL] ${step}${detail ? ` — ${detail}` : ''}`);
}

function skip(step, reason) {
  console.log(`[SKIP] ${step} — ${reason}`);
}

async function fetchJson(url, options = {}, timeoutMs = 60_000) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body };
}

async function fetchWithRetry(label, url, options = {}, attempts = 3) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchJson(url, options);
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) {
        console.log(`[retry] ${label} (${i + 1}/${attempts - 1})…`);
        await new Promise((r) => setTimeout(r, 4000));
      }
    }
  }
  throw lastErr;
}

async function checkHealth() {
  try {
    const { res, body } = await fetchWithRetry('health', `${GATEWAY}/health`);
    if (res.ok && body?.status === 'ok') {
      pass('GET /health', String(res.status));
    } else {
      fail('GET /health', `status=${res.status}`);
    }
  } catch (e) {
    fail('GET /health', e instanceof Error ? e.message : String(e));
  }
}

async function checkReady() {
  try {
    const { res, body } = await fetchWithRetry('ready', `${GATEWAY}/ready`);
    const db = body?.checks?.database;
    const redis = body?.checks?.redis;
    if (res.ok && db && redis) {
      pass('GET /ready', 'database + redis');
    } else {
      fail('GET /ready', `status=${res.status} db=${db} redis=${redis}`);
    }
  } catch (e) {
    fail('GET /ready', e instanceof Error ? e.message : String(e));
  }
}

async function signInSupabase() {
  if (!EMAIL || !PASSWORD) return null;
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    skip('Supabase sign-in', 'set SUPABASE_URL + anon key for JWT checks');
    return null;
  }
  const { res, body } = await fetchWithRetry('supabase', `${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok || !body?.access_token) {
    fail('Supabase sign-in', body?.error_description || body?.msg || String(res.status));
    return null;
  }
  pass('Supabase sign-in', EMAIL);
  return body.access_token;
}

async function apiWithBearer(path, token, method = 'GET') {
  return fetchWithRetry(`api ${path}`, `${GATEWAY}/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
}

async function checkAuthenticatedApi(token) {
  const me = await apiWithBearer('/tenants/me', token);
  const tenantId = me.body?.data?.id;
  if (me.res.ok && tenantId) {
    pass('GET /tenants/me', tenantId.slice(0, 8) + '…');
  } else if (me.res.status === 403) {
    skip('GET /tenants/me', 'no workspace yet (complete onboarding)');
  } else {
    fail('GET /tenants/me', `status=${me.res.status}`);
  }

  const wsTok = await apiWithBearer('/ai-config/ws-token', token);
  if (wsTok.res.ok && wsTok.body?.data?.token) {
    pass('GET /ai-config/ws-token');
  } else if (me.res.status === 403) {
    skip('GET /ai-config/ws-token', 'no tenant');
  } else {
    fail('GET /ai-config/ws-token', `status=${wsTok.res.status}`);
  }

  return tenantId || TENANT_HINT || null;
}

async function probeSse(token, tenantId) {
  if (!token) {
    skip('SSE /dashboard/stream', 'needs JWT');
    return;
  }

  const tokenRes = await fetchWithRetry('sse-token', `${GATEWAY}/api/v1/dashboard/sse-token`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!tokenRes.res.ok) {
    fail('GET /dashboard/sse-token', `HTTP ${tokenRes.res.status}`);
    return;
  }
  pass('GET /dashboard/sse-token');

  const streamToken = tokenRes.body?.data?.token;
  if (!streamToken) {
    fail('SSE token payload', 'missing data.token');
    return;
  }

  const url = `${GATEWAY}/api/v1/dashboard/stream?token=${encodeURIComponent(streamToken)}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 14_000);

  try {
    const res = await fetch(url, {
      headers: { Accept: 'text/event-stream' },
      signal: ac.signal,
    });
    if (!res.ok) {
      fail('SSE /dashboard/stream', `HTTP ${res.status}`);
      return;
    }
    const reader = res.body?.getReader();
    if (!reader) {
      fail('SSE /dashboard/stream', 'no body');
      return;
    }
    const decoder = new TextDecoder();
    let buf = '';
    while (buf.length < 12_000) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      if (
        buf.includes('"connected"') &&
        (buf.includes('totalCalls') || buf.includes('"push"'))
      ) {
        pass('SSE /dashboard/stream', 'connected + live data');
        return;
      }
    }
    fail('SSE /dashboard/stream', 'no events within 14s');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    fail('SSE /dashboard/stream', msg.includes('abort') ? 'timeout without events' : msg);
  } finally {
    clearTimeout(timer);
  }
}

async function probeAssistantChat(token) {
  if (!token) {
    skip('POST /dashboard-assistant/chat', 'needs JWT');
    return;
  }

  const csrfRes = await apiWithBearer('/dashboard/csrf-token', token);
  const csrf = csrfRes.body?.data?.csrfToken;
  if (!csrfRes.res.ok || !csrf) {
    skip('POST /dashboard-assistant/chat', 'no CSRF token');
    return;
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 25_000);

  try {
    const res = await fetch(`${GATEWAY}/api/v1/dashboard-assistant/chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrf,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        page: '/dashboard',
        messages: [{ role: 'user', content: 'What page is the Knowledge Base?' }],
      }),
      signal: ac.signal,
    });

    if (res.status === 401) {
      fail('POST /dashboard-assistant/chat', 'unauthorized');
      return;
    }
    if (!res.ok) {
      fail('POST /dashboard-assistant/chat', `HTTP ${res.status}`);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      fail('POST /dashboard-assistant/chat', 'no stream body');
      return;
    }

    const decoder = new TextDecoder();
    let buf = '';
    let gotDelta = false;
    while (buf.length < 16_000) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      if (buf.includes('event: delta') || buf.includes('"text"')) gotDelta = true;
      if (buf.includes('event: done') || buf.includes('event: error')) break;
    }

    if (buf.includes('event: error')) {
      const m = buf.match(/"error":"([^"]+)"/);
      skip('POST /dashboard-assistant/chat stream', m?.[1] || 'OPENAI may be unset');
      return;
    }
    if (gotDelta || buf.includes('event: done')) {
      pass('POST /dashboard-assistant/chat', 'SSE stream');
    } else {
      fail('POST /dashboard-assistant/chat', 'no SSE tokens in 25s');
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    fail('POST /dashboard-assistant/chat', msg.includes('abort') ? 'timeout' : msg);
  } finally {
    clearTimeout(timer);
  }
}

async function checkInternalMetrics() {
  if (!INTERNAL_KEY || !TENANT_HINT) {
    skip('Internal metrics', 'set VOICE_INTERNAL_API_KEY + SMOKE_TENANT_ID');
    return;
  }
  const { res, body } = await fetchWithRetry('metrics', `${GATEWAY}/api/v1/dashboard/metrics`, {
    headers: {
      'x-internal-api-key': INTERNAL_KEY,
      'x-tenant-id': TENANT_HINT,
    },
  });
  if (res.ok && body?.data != null) {
    pass('GET /dashboard/metrics (internal)');
  } else {
    fail('GET /dashboard/metrics (internal)', `status=${res.status}`);
  }
}

console.log(`\nCall IQ smoke — gateway: ${GATEWAY}\n`);

await checkHealth();
await checkReady();

const token = await signInSupabase();
let tenantId = null;
if (token) {
  tenantId = await checkAuthenticatedApi(token);
}

await probeSse(token, tenantId);
await probeAssistantChat(token);
await checkInternalMetrics();

console.log('');
if (failed > 0) {
  console.log(`Smoke finished with ${failed} failure(s).\n`);
  process.exit(1);
}
console.log('Smoke finished — all required checks passed.\n');
