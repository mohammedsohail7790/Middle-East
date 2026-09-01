/**
 * Dashboard audit — every page API + nav link reachability.
 * Usage: node scripts/audit-dashboard.mjs
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(root, '../apps/gateway/.env') });
config({ path: resolve(root, '../apps/dashboard/.env.local') });

const GATEWAY = (() => {
  if (process.env.SMOKE_GATEWAY_URL?.trim()) {
    return process.env.SMOKE_GATEWAY_URL.trim().replace(/\/$/, '');
  }
  const pub = (process.env.NEXT_PUBLIC_GATEWAY_API_URL || '').trim();
  if (pub && !/localhost|127\.0\.0\.1/i.test(pub)) {
    return pub.replace(/\/$/, '');
  }
  return 'https://gateway.hallaai.com';
})();

const API = `${GATEWAY}/api/v1`;
const DASHBOARD = (process.env.DASHBOARD_URL || 'https://www.hallaai.com').replace(/\/$/, '');

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const EMAIL = process.env.E2E_TEST_EMAIL || process.env.SMOKE_TEST_EMAIL || 'smd49881@gmail.com';
const PASSWORD = process.env.E2E_TEST_PASSWORD || process.env.SMOKE_TEST_PASSWORD || '';

const results = { pass: [], fail: [], warn: [], skip: [] };

function pass(step, detail = '') {
  results.pass.push({ step, detail });
  console.log(`[PASS] ${step}${detail ? ` — ${detail}` : ''}`);
}
function fail(step, detail = '') {
  results.fail.push({ step, detail });
  console.log(`[FAIL] ${step}${detail ? ` — ${detail}` : ''}`);
}
function warn(step, detail = '') {
  results.warn.push({ step, detail });
  console.log(`[WARN] ${step}${detail ? ` — ${detail}` : ''}`);
}
function skip(step, reason) {
  results.skip.push({ step, reason });
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
  return { res, body, text };
}

async function signIn() {
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    skip('Auth', 'missing Supabase URL/anon key');
    return null;
  }
  if (PASSWORD) {
    const { res, body } = await fetchJson(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    if (res.ok && body?.access_token) {
      pass('Sign-in', EMAIL);
      return body.access_token;
    }
  }
  if (service) {
    const adminHeaders = {
      apikey: service,
      Authorization: `Bearer ${service}`,
      'Content-Type': 'application/json',
    };
    const link = await fetchJson(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ type: 'magiclink', email: EMAIL }),
    });
    const tokenHash = link.body?.hashed_token;
    if (link.res.ok && tokenHash) {
      const verify = await fetchJson(`${SUPABASE_URL}/auth/v1/verify`, {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'magiclink', token_hash: tokenHash }),
      });
      if (verify.res.ok && verify.body?.access_token) {
        pass('Sign-in (service role)', EMAIL);
        return verify.body.access_token;
      }
    }
  }
  skip('Auth', 'no password or service role');
  return null;
}

const DASHBOARD_ROUTES = [
  '/dashboard',
  '/dashboard/calls',
  '/dashboard/leads',
  '/dashboard/agent',
  '/dashboard/calendar',
  '/dashboard/sms',
  '/dashboard/analytics',
  '/dashboard/integrations',
  '/dashboard/knowledge',
  '/dashboard/billing',
  '/dashboard/phone-numbers',
  '/dashboard/settings',
  '/dashboard/automation',
  '/dashboard/team',
  '/dashboard/security',
  '/dashboard/compliance',
  '/dashboard/governance',
  '/dashboard/intelligence',
  '/dashboard/command-center',
  '/dashboard/quality',
  '/dashboard/ops',
  '/dashboard/support',
  '/dashboard/simulator',
  '/dashboard/audit-explorer',
  '/dashboard/billing-intelligence',
  '/dashboard/settings/features',
  '/dashboard/agents',
  '/dashboard/integrations/setup',
];

const SIDEBAR_LINKS = [
  '/dashboard',
  '/dashboard/calls',
  '/dashboard/leads',
  '/dashboard/agent',
  '/dashboard/calendar',
  '/dashboard/sms',
  '/dashboard/analytics',
  '/dashboard/integrations',
  '/dashboard/knowledge',
  '/dashboard/phone-numbers',
  '/dashboard/billing',
  '/dashboard/settings',
  '/dashboard/support',
];

const API_DELAY_MS = 250;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const API_GETS = [
  { path: '/dashboard/metrics', label: 'Home metrics' },
  { path: '/dashboard/call-volume', label: 'Call volume chart' },
  { path: '/dashboard/conversion', label: 'Conversion funnel' },
  { path: '/dashboard/bootstrap', label: 'Bootstrap bundle' },
  { path: '/dashboard/usage', label: 'Usage minutes' },
  { path: '/calls?limit=50&offset=0', label: 'Calls list' },
  { path: '/leads?limit=50&offset=0', label: 'Leads list' },
  { path: '/calendar/events', label: 'Calendar events' },
  { path: '/appointments?limit=200', label: 'Appointments fallback' },
  { path: '/analytics/metrics?startDate=2026-01-01&endDate=2026-06-17', label: 'Analytics metrics' },
  { path: '/analytics/call-volume?startDate=2026-01-01&endDate=2026-06-17', label: 'Analytics volume' },
  { path: '/analytics/conversion-funnel?startDate=2026-01-01&endDate=2026-06-17', label: 'Analytics funnel' },
  { path: '/ai-config', label: 'AI agent config' },
  { path: '/business-hours', label: 'Business hours' },
  { path: '/spam/settings', label: 'Spam settings' },
  { path: '/tenants/me', label: 'Tenant profile' },
  { path: '/integrations/catalog', label: 'Integration catalog' },
  { path: '/integrations/status', label: 'Integration status' },
  { path: '/knowledge', label: 'Knowledge base' },
  { path: '/billing/subscription', label: 'Billing subscription' },
  { path: '/billing/usage', label: 'Billing usage' },
  { path: '/billing/invoices', label: 'Billing invoices' },
  { path: '/billing/account-state', label: 'Account state' },
  { path: '/billing-intelligence/summary', label: 'Billing intelligence' },
  { path: '/billing-intelligence/forecast', label: 'Usage forecast' },
  { path: '/billing-intelligence/sla', label: 'SLA dashboard' },
  { path: '/billing-intelligence/sla/credits', label: 'SLA credits' },
  { path: '/team', label: 'Team members' },
  { path: '/automation/rules', label: 'Automation rules' },
  { path: '/sms/threads', label: 'SMS threads' },
  { path: '/phone-numbers', label: 'Phone numbers' },
  { path: '/phone-numbers/stats', label: 'Phone stats' },
  { path: '/qa/evaluations', label: 'QA evaluations' },
  { path: '/operations/alerts', label: 'Ops alerts' },
  { path: '/operations/recovery', label: 'Ops recovery' },
  { path: '/metrics/ai', label: 'AI governance metrics' },
  { path: '/compliance/audit-events?limit=20', label: 'Audit events' },
  { path: '/compliance/retention', label: 'Retention summary' },
  { path: '/compliance/hipaa/status', label: 'HIPAA status' },
  { path: '/compliance/baa', label: 'BAA status (security)' },
  { path: '/ip-allowlist', label: 'IP allowlist' },
  { path: '/search?q=test', label: 'Global search' },
  { path: '/ivr/agents', label: 'IVR agents' },
  { path: '/feature-flags', label: 'Feature flags' },
];

async function auditPageRoutes() {
  console.log('\n--- Dashboard page routes (HTML) ---');
  for (const route of DASHBOARD_ROUTES) {
    const url = `${DASHBOARD}${route}`;
    try {
      const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
      const status = res.status;
      if (status === 200) pass(`Page ${route}`, '200');
      else if ([301, 302, 307, 308].includes(status)) warn(`Page ${route}`, `redirect ${status}`);
      else if (status === 401 || status === 403) warn(`Page ${route}`, `${status} (auth wall — expected for protected app)`);
      else fail(`Page ${route}`, `HTTP ${status}`);
    } catch (e) {
      fail(`Page ${route}`, e instanceof Error ? e.message : String(e));
    }
  }
}

async function auditSidebarCoverage() {
  console.log('\n--- Sidebar vs all routes ---');
  const orphan = DASHBOARD_ROUTES.filter(
    (r) =>
      !SIDEBAR_LINKS.includes(r) &&
      !r.includes('/calls/') &&
      r !== '/dashboard/agents' &&
      r !== '/dashboard/integrations/setup' &&
      r !== '/dashboard/settings/features'
  );
  for (const r of orphan) {
    warn(`Orphan route (not in sidebar)`, r);
  }
  pass('Sidebar nav items', String(SIDEBAR_LINKS.length));
}

async function auditApis(token) {
  console.log('\n--- Gateway APIs (authenticated) ---');
  if (!token) {
    skip('API audit', 'no auth token');
    return;
  }

  let csrf = '';
  const csrfRes = await fetchJson(`${API}/dashboard/csrf-token`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (csrfRes.res.ok && csrfRes.body?.token) csrf = csrfRes.body.token;

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
  };

  for (const { path, label } of API_GETS) {
    const { res, text } = await fetchJson(`${API}${path}`, { headers });
    const status = res.status;
    if (status >= 500) fail(`API ${label}`, `${path} → ${status}`);
    else if (status === 404) warn(`API ${label}`, `${path} → 404`);
    else if (status === 403) warn(`API ${label}`, `${path} → 403 plan/role`);
    else if (status >= 400) warn(`API ${label}`, `${path} → ${status}`);
    else {
      const detail = text.length > 80 ? `${status}, ${text.slice(0, 60)}…` : `${status}`;
      pass(`API ${label}`, detail);
    }
    await sleep(API_DELAY_MS);
  }

  // Dataflow sanity
  const metrics = await fetchJson(`${API}/dashboard/metrics`, { headers });
  if (metrics.res.ok) {
    const d = metrics.body?.data ?? metrics.body;
    if (d && typeof d.totalCalls === 'number' && typeof d.leads === 'number') {
      pass('Dataflow metrics', `calls=${d.totalCalls} leads=${d.leads}`);
    } else {
      warn('Dataflow metrics', 'missing totalCalls/leads shape');
    }
  }

  const calls = await fetchJson(`${API}/calls?limit=5`, { headers });
  if (calls.res.ok) {
    const items = calls.body?.data?.items ?? calls.body?.items ?? calls.body?.data ?? calls.body;
    const count = Array.isArray(items) ? items.length : 0;
    pass('Dataflow calls→list', `${count} items returned`);
    if (count > 0 && items[0]?.id) {
      const detail = await fetchJson(`${API}/calls/${items[0].id}`, { headers });
      if (detail.res.ok) pass('Dataflow call detail', items[0].id.slice(0, 8) + '…');
      else warn('Dataflow call detail', `GET /calls/:id → ${detail.res.status}`);
    }
  }
}

async function main() {
  console.log('=== Halla AI Dashboard Audit ===');
  console.log(`Dashboard: ${DASHBOARD}`);
  console.log(`Gateway:   ${GATEWAY}`);
  console.log(`User:      ${EMAIL}`);

  await auditPageRoutes();
  await auditSidebarCoverage();

  const token = await signIn();
  await auditApis(token);

  console.log('\n--- Summary ---');
  console.log(`PASS: ${results.pass.length}  FAIL: ${results.fail.length}  WARN: ${results.warn.length}  SKIP: ${results.skip.length}`);
  process.exit(results.fail.length > 0 ? 1 : 0);
}

main();
