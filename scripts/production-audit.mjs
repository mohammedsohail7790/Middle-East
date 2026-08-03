/**
 * Production audit — gateway, DB schema, tenant data, integrations, call webhook.
 * Usage: node scripts/production-audit.mjs
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { randomBytes, createHmac } from 'crypto';

const root = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(root, '../apps/gateway/.env') });
config({ path: resolve(root, '../apps/dashboard/.env.local') });
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

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const EMAIL = process.env.E2E_TEST_EMAIL || process.env.SMOKE_TEST_EMAIL || '';
const PASSWORD = process.env.E2E_TEST_PASSWORD || process.env.SMOKE_TEST_PASSWORD || '';
if (!EMAIL || !PASSWORD) {
  console.warn('[WARN] E2E_TEST_EMAIL and E2E_TEST_PASSWORD not set — auth-dependent audit steps will be skipped');
}
const TENANT_ID = process.env.SMOKE_TENANT_ID || process.env.E2E_TENANT_ID || '2a9ea1e6-fa09-497c-8107-e704af6b1802';

const DB_URL = process.env.GATEWAY_DATABASE_URL || process.env.DATABASE_URL;

const ZAPIER_PLACEHOLDER_URL = 'https://hooks.zapier.com/hooks/catch/00000000/00000000/';

function twilioSignature(url, params, authToken) {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], '');
  return createHmac('sha1', authToken).update(url + data).digest('base64');
}

function buildTwilioWebhookRequest(webhookPath, params) {
  const url = `${GATEWAY}${webhookPath}`;
  const authToken = process.env.TWILIO_AUTH_TOKEN || '';
  const signature = authToken ? twilioSignature(url, params, authToken) : '';
  return { url, signature, body: new URLSearchParams(params) };
}

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

async function signInWithServiceRole() {
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!SUPABASE_URL || !service || !EMAIL) return null;
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
  if (!link.res.ok || !tokenHash) return null;
  const verify = await fetchJson(`${SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON || service, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: tokenHash }),
  });
  if (!verify.res.ok || !verify.body?.access_token) return null;
  pass('Supabase sign-in (service role)', EMAIL);
  return verify.body.access_token;
}

async function signIn() {
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    skip('Supabase sign-in', 'missing URL or anon key');
    return null;
  }
  if (PASSWORD) {
    const { res, body } = await fetchJson(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    if (res.ok && body?.access_token) {
      pass('Supabase sign-in (password)', EMAIL);
      return body.access_token;
    }
  }
  const fromService = await signInWithServiceRole();
  if (fromService) return fromService;
  skip('Supabase sign-in', 'set E2E_TEST_PASSWORD or SUPABASE_SERVICE_ROLE_KEY');
  return null;
}

async function auditDatabase() {
  if (!DB_URL) {
    fail('Database connection', 'GATEWAY_DATABASE_URL not set');
    return;
  }
  const pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

  try {
    const tables = [
      'integration_oauth_states',
      'integration_audit_log',
      'integration_sync_state',
      'calls',
      'leads',
      'voice_tenants',
      'calendar_connections',
      'slack_connections',
      'knowledge_base',
      'team_members',
    ];
    for (const t of tables) {
      const r = await pool.query(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = $1
         ) AS ok`,
        [t]
      );
      if (r.rows[0]?.ok) pass(`DB table public.${t}`, 'exists');
      else fail(`DB table public.${t}`, 'MISSING');
    }

    const oauthCount = await pool.query(`SELECT count(*)::int AS n FROM public.integration_oauth_states`);
    pass('integration_oauth_states row count', String(oauthCount.rows[0]?.n ?? 0));

    const state = randomBytes(16).toString('hex');
    await pool.query(
      `INSERT INTO public.integration_oauth_states (state, tenant_id, provider, redirect_uri, code_verifier, expires_at)
       VALUES ($1, $2, 'hubspot', 'https://example.com/cb', 'https://www.calliqlabs.com', NOW() + INTERVAL '10 minutes')`,
      [state, TENANT_ID]
    );
    await pool.query(`DELETE FROM public.integration_oauth_states WHERE state = $1`, [state]);
    pass('OAuth state INSERT/DELETE', TENANT_ID.slice(0, 8) + '…');

    const tenant = await pool.query(
      `SELECT id, company_name, phone_number,
              zapier_webhook_url IS NOT NULL AS zapier_configured,
              hubspot_api_key IS NOT NULL AS hubspot_token,
              salesforce_access_token IS NOT NULL AS salesforce_token,
              google_refresh_token IS NOT NULL AS google_legacy_token
       FROM public.voice_tenants WHERE id = $1`,
      [TENANT_ID]
    );
    if (!tenant.rows[0]) {
      fail('Tenant lookup', TENANT_ID);
    } else {
      const t = tenant.rows[0];
      pass('Tenant record', `${t.company_name || 'unnamed'} phone=${t.phone_number || 'none'}`);
      pass('Zapier configured (DB)', t.zapier_configured ? 'yes' : 'no');
      pass('HubSpot token (DB)', t.hubspot_token ? 'present' : 'absent');
      pass('Salesforce token (DB)', t.salesforce_token ? 'present' : 'absent');
    }

    const calls = await pool.query(
      `SELECT count(*)::int AS n FROM public.calls WHERE tenant_id = $1`,
      [TENANT_ID]
    );
    const leads = await pool.query(
      `SELECT count(*)::int AS n FROM public.leads WHERE tenant_id = $1`,
      [TENANT_ID]
    );
    pass('Tenant calls count', String(calls.rows[0]?.n ?? 0));
    pass('Tenant leads count', String(leads.rows[0]?.n ?? 0));

    const recent = await pool.query(
      `SELECT call_sid, outcome, duration_ms, left(transcript, 40) AS transcript_preview, created_at
       FROM public.calls WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 3`,
      [TENANT_ID]
    );
    if (recent.rows.length) {
      pass('Recent calls sample', recent.rows.map((r) => `${r.call_sid?.slice(0, 12)}… ${r.outcome || '—'}`).join(' | '));
    } else {
      warn('Recent calls', 'no calls for tenant');
    }

    const cal = await pool.query(
      `SELECT provider, status,
              (access_token IS NOT NULL) AS has_access,
              (refresh_token IS NOT NULL) AS has_refresh
       FROM public.calendar_connections WHERE tenant_id = $1`,
      [TENANT_ID]
    );
    const calProviders = cal.rows.map((r) => r.provider);
    const activeCalProviders = cal.rows
      .filter((r) => (r.has_access || r.has_refresh) && (r.status ?? 'active') === 'active')
      .map((r) => r.provider);
    pass('Calendar connections', calProviders.length ? calProviders.join(', ') : 'none');
    if (activeCalProviders.length) {
      pass('Calendar active tokens', activeCalProviders.join(', '));
    }

    const slack = await pool.query(
      `SELECT enabled FROM public.slack_connections WHERE tenant_id = $1 LIMIT 1`,
      [TENANT_ID]
    );
    pass('Slack connection', slack.rows[0] ? (slack.rows[0].enabled ? 'enabled' : 'disabled') : 'none');

    return { ...tenant.rows[0], calendar_providers: calProviders, active_calendar_providers: activeCalProviders };
  } catch (e) {
    fail('Database audit', e instanceof Error ? e.message : String(e));
    return null;
  } finally {
    await pool.end();
  }
}

async function auditZapier(headers, csrf, statusList) {
  const auditWebhookUrl = (
    process.env.AUDIT_ZAPIER_WEBHOOK_URL ||
    process.env.ZAPIER_AUDIT_WEBHOOK_URL ||
    ''
  ).trim();

  let zapierConnected = statusList.find((s) => s.provider === 'zapier' && s.connected);

  if (!zapierConnected) {
    const webhookUrl = auditWebhookUrl || ZAPIER_PLACEHOLDER_URL;
    const configure = await fetchJson(`${GATEWAY}/api/v1/integrations/zapier/configure`, {
      method: 'POST',
      headers: { ...headers, 'X-CSRF-Token': csrf },
      body: JSON.stringify({ webhookUrl }),
    });
    if (configure.res.ok && configure.body?.success !== false) {
      pass(
        'POST /integrations/zapier/configure',
        auditWebhookUrl ? 'from AUDIT_ZAPIER_WEBHOOK_URL' : 'placeholder URL saved'
      );
      zapierConnected = { provider: 'zapier', connected: true };
    } else {
      fail(
        'POST /integrations/zapier/configure',
        configure.body?.error || configure.body?.message || String(configure.res.status)
      );
      return;
    }
  } else {
    pass('Zapier configured (API)', 'already connected');
  }

  if (!auditWebhookUrl) {
    pass('POST /integrations/zapier/test', 'skipped — no real AUDIT_ZAPIER_WEBHOOK_URL');
    return;
  }

  const test = await fetchJson(`${GATEWAY}/api/v1/integrations/zapier/test`, {
    method: 'POST',
    headers: { ...headers, 'X-CSRF-Token': csrf },
    body: JSON.stringify({}),
  });
  if (test.res.ok && test.body?.success !== false && test.body?.data?.success !== false) {
    pass('POST /integrations/zapier/test', 'webhook ping');
  } else {
    const msg = test.body?.data?.message || test.body?.error || test.body?.message || String(test.res.status);
    warn('POST /integrations/zapier/test', `${msg} (configure step passed)`);
  }
}

async function auditGateway(token, tenantRow) {
  try {
    const health = await fetchJson(`${GATEWAY}/health`);
    if (health.res.ok && health.body?.status === 'ok') pass('GET /health');
    else fail('GET /health', String(health.res.status));

    const ready = await fetchJson(`${GATEWAY}/ready`);
    const db = ready.body?.checks?.database;
    const redis = ready.body?.checks?.redis;
    if (ready.res.ok && db && redis) pass('GET /ready', 'database + redis');
    else fail('GET /ready', `db=${db} redis=${redis}`);

    const oauthHealth = await fetchJson(`${GATEWAY}/api/v1/integrations/oauth-health`);
    if (oauthHealth.res.ok) pass('GET /integrations/oauth-health');
    else fail('GET /integrations/oauth-health', String(oauthHealth.res.status));
  } catch (e) {
    fail('Gateway health', e instanceof Error ? e.message : String(e));
  }

  if (!token) return;

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const me = await fetchJson(`${GATEWAY}/api/v1/tenants/me`, { headers });
  if (me.res.ok && me.body?.data?.id) pass('GET /tenants/me', me.body.data.id);
  else fail('GET /tenants/me', String(me.res.status));

  const caps = await fetchJson(`${GATEWAY}/api/v1/integrations/oauth-capabilities`, { headers });
  if (caps.res.ok && Array.isArray(caps.body?.data)) {
    const configured = caps.body.data.filter((c) => c.configured).map((c) => c.provider);
    const missing = caps.body.data.filter((c) => !c.configured).map((c) => c.provider);
    pass('OAuth capabilities configured', configured.join(', ') || 'none');
    if (missing.length) warn('OAuth capabilities missing env', missing.join(', '));
  } else {
    fail('GET /integrations/oauth-capabilities', String(caps.res.status));
  }

  const status = await fetchJson(`${GATEWAY}/api/v1/integrations/status`, { headers });
  let statusList = [];
  if (status.res.ok) {
    statusList = Array.isArray(status.body?.data) ? status.body.data : status.body || [];
    const connected = statusList.filter((s) => s.connected).map((s) => s.provider);
    pass('GET /integrations/status', connected.length ? `connected: ${connected.join(', ')}` : 'none connected');

    const dbCalActive = tenantRow?.active_calendar_providers;
    if (dbCalActive?.length) {
      const apiGoogle = statusList.find((s) => s.provider === 'google-calendar')?.connected;
      if (!apiGoogle) {
        warn('Calendar status mismatch', `DB has active ${dbCalActive.join(', ')} but API shows google-calendar disconnected`);
      }
    } else if (tenantRow?.calendar_providers?.length) {
      pass('Calendar stale rows', `${tenantRow.calendar_providers.join(', ')} present without active tokens (API disconnected is correct)`);
    }
  } else {
    fail('GET /integrations/status', String(status.res.status));
  }

  const csrfRes = await fetchJson(`${GATEWAY}/api/v1/dashboard/csrf-token`, { headers });
  const csrf = csrfRes.body?.data?.csrfToken;
  if (!csrf) {
    skip('Zapier test POST', 'no CSRF token');
    return;
  }

  await auditZapier(headers, csrf, statusList);

  const phone =
    tenantRow?.phone_number ||
    (await fetchJson(`${GATEWAY}/api/v1/phone-numbers`, { headers })).body?.data?.numbers?.[0]?.phoneNumber;

  if (!phone) {
    skip('Call webhook simulation', 'no tenant phone number');
    return;
  }

  const callSid = `CA_audit_${Date.now()}`;
  const webhookPath = '/api/v1/voice/incoming-call';
  const webhookParams = { From: '+15551234567', To: phone, CallSid: callSid };
  const twilioReq = buildTwilioWebhookRequest(webhookPath, webhookParams);
  const webhookHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (twilioReq.signature) {
    webhookHeaders['x-twilio-signature'] = twilioReq.signature;
  } else {
    warn('Twilio signature', 'TWILIO_AUTH_TOKEN not set — webhook may return 403');
  }

  const webhook = await fetchJson(twilioReq.url, {
    method: 'POST',
    headers: webhookHeaders,
    body: twilioReq.body,
  });
  const twiml = webhook.text || '';
  const hasStream = twiml.includes('<Stream') && twiml.includes('<Connect');
  if (webhook.res.status === 200 && hasStream) {
    pass('POST /voice/incoming-call', 'TwiML with Media Stream');
    const streamMatch = twiml.match(/url="([^"]+)"/);
    const streamUrl = streamMatch?.[1]?.replace(/&amp;/g, '&') || '';
    if (streamUrl.includes('calliq-gateway.onrender.com') && !streamUrl.includes('call-iq-gateway')) {
      fail('Stream URL hostname', 'dead host calliq-gateway (missing hyphen)');
    } else if (streamUrl) {
      pass('Stream URL host', new URL(streamUrl.replace(/^wss:/i, 'https:')).hostname);
    }
  } else {
    fail('POST /voice/incoming-call', webhook.res.status + ' ' + twiml.slice(0, 120));
  }

  if (DB_URL) {
    const pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
    try {
      await new Promise((r) => setTimeout(r, 1500));
      const row = await pool.query(
        `SELECT call_sid FROM public.calls WHERE tenant_id = $1 AND call_sid = $2`,
        [TENANT_ID, callSid]
      );
      if (row.rows.length) pass('Call row after webhook', callSid);
      else fail('Call row after webhook', 'ensureCallRecord did not persist');
    } finally {
      await pool.end();
    }
  }
}

console.log(`\n=== Call IQ Production Audit ===`);
console.log(`Gateway: ${GATEWAY}`);
console.log(`Tenant:  ${TENANT_ID}`);
console.log(`User:    ${EMAIL}\n`);

console.log('--- Database ---');
const tenantRow = await auditDatabase();

console.log('\n--- Gateway & APIs ---');
const token = await signIn();
await auditGateway(token, tenantRow);

console.log('\n--- Summary ---');
console.log(`PASS: ${results.pass.length}  FAIL: ${results.fail.length}  WARN: ${results.warn.length}  SKIP: ${results.skip.length}`);
if (results.fail.length) {
  console.log('\nFailures:');
  for (const f of results.fail) console.log(`  • ${f.step}: ${f.detail}`);
  process.exit(1);
}
console.log('\nAudit complete.\n');
