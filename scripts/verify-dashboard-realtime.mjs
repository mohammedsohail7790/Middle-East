/**
 * Full dashboard realtime verification against production/staging gateway.
 *
 * Usage:
 *   npm run verify:realtime:prod
 *
 * Env: same as scripts/smoke-production.mjs (SMOKE_*, E2E_*, Supabase, optional internal key)
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

config({ path: resolve(root, 'apps/gateway/.env') });
config({ path: resolve(root, 'apps/dashboard/.env.local') });
config({ path: resolve(root, '.env.e2e') });

function resolveGatewayUrl() {
  if (process.env.SMOKE_GATEWAY_URL?.trim()) {
    return process.env.SMOKE_GATEWAY_URL.trim().replace(/\/$/, '');
  }
  const pub = (process.env.NEXT_PUBLIC_GATEWAY_API_URL || '').trim();
  if (pub && !/localhost|127\.0\.0\.1/i.test(pub)) {
    return pub.replace(/\/$/, '');
  }
  return 'https://call-iq-gateway.onrender.com';
}

const GATEWAY = resolveGatewayUrl();

const SUPABASE_URL = (
  process.env.SMOKE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  ''
).replace(/\/$/, '');

const SUPABASE_ANON = process.env.SMOKE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE =
  process.env.SMOKE_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  '';
const EMAIL = process.env.SMOKE_TEST_EMAIL || process.env.E2E_TEST_EMAIL || '';
const PASSWORD = process.env.SMOKE_TEST_PASSWORD || process.env.E2E_TEST_PASSWORD || '';

/** Page → gateway GET paths (mirrors e2e/helpers/dashboard-api.ts) */
const PAGE_APIS = [
  { page: 'overview', paths: ['/dashboard/metrics', '/dashboard/call-volume', '/calls'] },
  { page: 'calls', paths: ['/calls'] },
  { page: 'leads', paths: ['/leads'] },
  { page: 'agent', paths: ['/ai-config'] },
  { page: 'calendar', paths: ['/calendar/events'] },
  { page: 'sms', paths: ['/sms/conversations'] },
  { page: 'analytics', paths: ['/analytics/metrics', '/analytics/call-volume'] },
  { page: 'integrations', paths: ['/integrations/status'] },
  { page: 'knowledge', paths: ['/knowledge'] },
  { page: 'billing', paths: ['/billing/subscription', '/billing/usage'] },
  { page: 'phone-numbers', paths: ['/phone-numbers'] },
  { page: 'settings', paths: ['/tenants/me'] },
];

function analyticsDateRange() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 30);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function buildApiUrl(path, tenantId) {
  const url = new URL(`${GATEWAY}/api/v1${path}`);
  if (path.startsWith('/analytics/')) {
    const { startDate, endDate } = analyticsDateRange();
    url.searchParams.set('startDate', startDate);
    url.searchParams.set('endDate', endDate);
  }
  return url.toString();
}

function apiHeaders(bearer, tenantId) {
  const headers = { Authorization: `Bearer ${bearer}` };
  if (tenantId) headers['x-tenant-id'] = tenantId;
  return headers;
}
let failed = 0;
let warnings = 0;

function pass(step, detail = '') {
  console.log(`[PASS] ${step}${detail ? ` — ${detail}` : ''}`);
}
function fail(step, detail = '') {
  failed += 1;
  console.log(`[FAIL] ${step}${detail ? ` — ${detail}` : ''}`);
}
function warn(step, detail = '') {
  warnings += 1;
  console.log(`[WARN] ${step}${detail ? ` — ${detail}` : ''}`);
}
function skip(step, reason) {
  console.log(`[SKIP] ${step} — ${reason}`);
}

function resolveDashboardUrl() {
  const fromEnv = (
    process.env.SMOKE_DASHBOARD_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.PLAYWRIGHT_BASE_URL ||
    ''
  ).trim();
  if (fromEnv && !/localhost|127\.0\.0\.1/i.test(fromEnv)) {
    return fromEnv.replace(/\/$/, '');
  }
  return 'https://www.calliqlabs.com';
}

const DASHBOARD_ORIGIN = resolveDashboardUrl();

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

async function signInWithPassword() {
  if (!EMAIL || !PASSWORD || !SUPABASE_URL || !SUPABASE_ANON) return null;
  const { res, body } = await fetchJson(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok || !body?.access_token) return null;
  pass('Supabase sign-in (password)', EMAIL);
  return body.access_token;
}

/** CI / local verify when password is not stored — requires service role key. */
async function signInWithServiceRole() {
  if (!EMAIL || !SUPABASE_URL || !SUPABASE_SERVICE) return null;

  const adminHeaders = {
    apikey: SUPABASE_SERVICE,
    Authorization: `Bearer ${SUPABASE_SERVICE}`,
    'Content-Type': 'application/json',
  };

  const link = await fetchJson(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ type: 'magiclink', email: EMAIL }),
  });

  const tokenHash = link.body?.hashed_token;
  if (!link.res.ok || !tokenHash) {
    fail('Supabase admin generate_link', link.body?.msg || String(link.res.status));
    return null;
  }

  const verify = await fetchJson(`${SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON || SUPABASE_SERVICE,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'magiclink',
      token_hash: tokenHash,
    }),
  });

  if (!verify.res.ok || !verify.body?.access_token) {
    fail('Supabase verify magiclink', verify.body?.error_description || String(verify.res.status));
    return null;
  }

  pass('Supabase sign-in (service role)', EMAIL);
  return verify.body.access_token;
}

async function signInSupabase() {
  if (!EMAIL) {
    skip('Supabase sign-in', 'set E2E_TEST_EMAIL or SMOKE_TEST_EMAIL');
    return null;
  }
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    skip('Supabase sign-in', 'set SUPABASE_URL + anon key');
    return null;
  }

  const fromPassword = await signInWithPassword();
  if (fromPassword) return fromPassword;

  const fromService = await signInWithServiceRole();
  if (fromService) return fromService;

  fail(
    'Supabase sign-in',
    PASSWORD
      ? 'password sign-in failed — check E2E_TEST_PASSWORD'
      : 'set E2E_TEST_PASSWORD or SUPABASE_SERVICE_ROLE_KEY in apps/dashboard/.env.local'
  );
  return null;
}

function parseSseEvents(buffer) {
  const events = [];
  for (const block of buffer.split('\n\n')) {
    for (const line of block.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      try {
        events.push(JSON.parse(line.slice(6)));
      } catch {
        /* ignore */
      }
    }
  }
  return events;
}

async function fetchCsrfToken(bearer) {
  const { res, body } = await fetchJson(`${GATEWAY}/api/v1/dashboard/csrf-token`, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  if (!res.ok) return null;
  return body?.data?.csrfToken ?? null;
}

function readSseUntilConnected(streamUrl, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const lib = streamUrl.startsWith('https') ? https : http;
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error('timeout waiting for connected event'));
    }, timeoutMs);

    const req = lib.get(
      streamUrl,
      { headers: { Accept: 'text/event-stream' }, timeout: timeoutMs },
      (res) => {
        if (res.statusCode !== 200) {
          clearTimeout(timer);
          res.resume();
          reject(new Error(`stream HTTP ${res.statusCode}`));
          return;
        }

        let buf = '';
        res.on('data', (chunk) => {
          buf += chunk.toString();
          const events = parseSseEvents(buf);
          const connected = events.some((e) => e.connected === true);
          const metrics = events.some((e) => typeof e.totalCalls === 'number');
          if (connected) {
            clearTimeout(timer);
            req.destroy();
            resolve(metrics ? 'connected + metrics' : 'connected');
          }
        });
        res.on('end', () => {
          clearTimeout(timer);
          reject(new Error('stream ended before connected event'));
        });
        res.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      }
    );

    req.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function probeSse(bearer) {
  if (!bearer) {
    skip('SSE /dashboard/stream', 'needs JWT');
    return;
  }

  const bases = [GATEWAY];
  let lastError = 'no stream response';

  for (const base of bases) {
    const tokenRes = await fetchJson(`${base}/api/v1/dashboard/sse-token`, {
      headers: { Authorization: `Bearer ${bearer}` },
    });
    if (!tokenRes.res.ok) {
      lastError = `${base} sse-token HTTP ${tokenRes.res.status}`;
      continue;
    }

    const streamToken = tokenRes.body?.data?.token;
    if (!streamToken) {
      lastError = `${base} missing stream token`;
      continue;
    }

    if (base === bases[0]) pass('GET /dashboard/sse-token');

    const url = `${base}/api/v1/dashboard/stream?token=${encodeURIComponent(streamToken)}`;

    try {
      const detail = await readSseUntilConnected(url);
      pass('SSE /dashboard/stream', `${base} — ${detail}`);
      return;
    } catch (e) {
      lastError = `${base} ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  warn('SSE /dashboard/stream', lastError);
}

async function checkPageApis(bearer) {
  if (!bearer) {
    skip('Page APIs', 'needs JWT');
    return;
  }

  const me = await fetchJson(`${GATEWAY}/api/v1/tenants/me`, {
    headers: apiHeaders(bearer),
  });
  if (!me.res.ok) {
    skip('Page APIs', 'no tenant — complete onboarding');
    return;
  }

  const tenantId = me.body?.data?.id;

  for (const { page, paths } of PAGE_APIS) {
    for (const path of paths) {
      const { res } = await fetchJson(buildApiUrl(path, tenantId), {
        headers: apiHeaders(bearer, tenantId),
      });
      if (res.status < 500) {
        pass(`${page} GET ${path}`, String(res.status));
      } else {
        fail(`${page} GET ${path}`, `HTTP ${res.status}`);
      }
    }
  }
}

async function checkLeadRealtimeMutation(bearer) {
  if (!bearer) {
    skip('Lead create mutation', 'needs JWT');
    return;
  }

  const csrf = await fetchCsrfToken(bearer);
  if (!csrf) {
    fail('POST /leads (mutation → push)', 'could not fetch CSRF token');
    return;
  }

  const phone = `+1555${String(Date.now()).slice(-7)}`;
  const create = await fetchJson(`${GATEWAY}/api/v1/leads`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
    },
    body: JSON.stringify({
      phoneNumber: phone,
      source: 'verify-realtime',
      name: 'Verify Realtime Lead',
    }),
  });

  if (!create.res.ok) {
    fail('POST /leads (mutation → push)', `HTTP ${create.res.status}`);
    return;
  }
  pass('POST /leads (mutation → push)');

  const list = await fetchJson(`${GATEWAY}/api/v1/leads`, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  if (!list.res.ok) {
    fail('GET /leads after create', `HTTP ${list.res.status}`);
    return;
  }
  const payload = JSON.stringify(list.body);
  if (payload.includes(phone)) {
    pass('Lead visible in GET /leads', phone);
  } else {
    fail('Lead visible in GET /leads', 'phone not found');
  }
}

async function checkHealth() {
  try {
    const { res, body } = await fetchJson(`${GATEWAY}/health`);
    if (res.ok && body?.status === 'ok') pass('GET /health');
    else fail('GET /health', String(res.status));
  } catch (e) {
    fail('GET /health', e instanceof Error ? e.message : String(e));
  }
}

async function checkReady() {
  try {
    const { res, body } = await fetchJson(`${GATEWAY}/ready`);
    const db = body?.checks?.database;
    const redis = body?.checks?.redis;
    if (res.ok && db && redis) pass('GET /ready', 'database + redis');
    else fail('GET /ready', `status=${res.status} db=${db} redis=${redis}`);
  } catch (e) {
    fail('GET /ready', e instanceof Error ? e.message : String(e));
  }
}

console.log(`\nCall IQ dashboard realtime verify — gateway: ${GATEWAY}`);
console.log(`Dashboard origin (SSE): ${DASHBOARD_ORIGIN}\n`);

await checkHealth();
await checkReady();

const bearer = await signInSupabase();
await probeSse(bearer);
await checkPageApis(bearer);
await checkLeadRealtimeMutation(bearer);

console.log('');
if (failed > 0) {
  console.log(`Verify finished with ${failed} failure(s)${warnings ? `, ${warnings} warning(s)` : ''}.\n`);
  process.exit(1);
}
if (warnings > 0) {
  console.log(`Verify finished — all required checks passed (${warnings} warning(s)).\n`);
} else {
  console.log('Verify finished — all checks passed.\n');
}
