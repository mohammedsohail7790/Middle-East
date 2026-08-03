/**
 * End-to-end data flow + simulated call flow validation (local gateway).
 * Usage: node scripts/validate-flows.mjs
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../apps/gateway/.env') });

const BASE = process.env.PLAYWRIGHT_GATEWAY_URL || 'http://127.0.0.1:3003';
const TENANT = process.env.E2E_TENANT_ID || '2a9ea1e6-fa09-497c-8107-e704af6b1802';
const KEY = process.env.VOICE_INTERNAL_API_KEY;

if (!KEY) {
  console.error('Missing VOICE_INTERNAL_API_KEY in apps/gateway/.env');
  process.exit(1);
}

const authHeaders = {
  'x-tenant-id': TENANT,
  'x-internal-api-key': KEY,
  'Content-Type': 'application/json',
};

function log(step, ok, detail = '') {
  const icon = ok ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${step}${detail ? ` — ${detail}` : ''}`);
}

async function waitForGateway(maxMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(5000) });
      if (r.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

async function apiGet(path) {
  const r = await fetch(`${BASE}/api/v1${path}`, { headers: authHeaders });
  const text = await r.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: r.status, ok: r.ok, body };
}

function extractStreamUrl(twiml) {
  const m = twiml.match(/<Stream url="([^"]+)"/i);
  return m?.[1]?.replace(/&amp;/g, '&') ?? null;
}

function localWsUrl(streamUrl) {
  try {
    const u = new URL(streamUrl);
    u.protocol = 'ws:';
    u.host = '127.0.0.1:3003';
    return u.toString();
  } catch {
    return streamUrl.replace(/^wss:/i, 'ws:').replace(/call-iq-gateway\.onrender\.com/i, '127.0.0.1:3003');
  }
}

function twilioStart(streamSid, callSid) {
  return JSON.stringify({
    event: 'start',
    streamSid,
    start: {
      callSid,
      accountSid: 'flow-validation',
      streamSid,
      customParameters: { from: '+15551234567', to: '+15559876543' },
    },
  });
}

function twilioMedia(streamSid, payload) {
  return JSON.stringify({ event: 'media', streamSid, media: { payload } });
}

function twilioStop(streamSid) {
  return JSON.stringify({ event: 'stop', streamSid });
}

async function simulateMediaStream(wsUrl, callSid, timeoutMs = 12_000) {
  return new Promise((resolve) => {
    const ws = new WebSocket(wsUrl);
    const streamSid = `MZ_flow_${Date.now()}`;
    const speech = Buffer.alloc(160, 0x80).toString('base64');
    let opened = false;
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve({ connected: opened, error: opened ? null : 'timeout' });
    }, timeoutMs);

    ws.on('open', () => {
      opened = true;
      ws.send(twilioStart(streamSid, callSid));
      let frames = 0;
      const iv = setInterval(() => {
        if (frames++ >= 8) {
          clearInterval(iv);
          ws.send(twilioStop(streamSid));
          setTimeout(() => {
            ws.close();
            clearTimeout(timer);
            resolve({ connected: true, error: null });
          }, 500);
          return;
        }
        ws.send(twilioMedia(streamSid, speech));
      }, 100);
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      resolve({ connected: false, error: String(err.message || err) });
    });
  });
}

async function main() {
  console.log('\n=== Call IQ flow validation ===\n');

  if (!(await waitForGateway())) {
    log('Gateway reachable', false, BASE);
    process.exit(1);
  }
  log('Gateway reachable', true, BASE);

  const ready = await fetch(`${BASE}/ready`).then((r) => r.json()).catch(() => null);
  const dbOk = ready?.checks?.database === true;
  const redisOk = ready?.checks?.redis === true;
  log('Database ready', dbOk);
  log('Redis ready', redisOk);

  const metricsBefore = await apiGet('/dashboard/metrics');
  const totalBefore = Number(metricsBefore.body?.data?.totalCalls ?? metricsBefore.body?.totalCalls ?? 0);
  log('Data flow: dashboard/metrics', metricsBefore.status === 200, `totalCalls=${totalBefore}`);

  const callsBefore = await apiGet('/calls');
  const listBefore = Array.isArray(callsBefore.body?.data) ? callsBefore.body.data.length : 0;
  log('Data flow: calls list', callsBefore.status === 200, `rows=${listBefore}`);

  const leads = await apiGet('/leads');
  log('Data flow: leads list', leads.status === 200);

  const volume = await apiGet('/dashboard/call-volume');
  log('Data flow: call-volume', volume.status === 200);

  const phones = await apiGet('/phone-numbers');
  const numbers = phones.body?.data?.numbers ?? phones.body?.numbers ?? [];
  const primary = numbers.find((n) => n.isPrimary || n.is_primary) || numbers[0];
  const toNumber = primary?.phoneNumber || primary?.phone_number || primary?.e164;
  log('Tenant phone resolved', Boolean(toNumber), toNumber || 'none');

  if (!toNumber) {
    console.log('\nCannot simulate call flow without a provisioned number.');
    process.exit(dbOk && redisOk && metricsBefore.status === 200 ? 0 : 1);
  }

  const callSid = `CA_flow_val_${Date.now()}`;
  const webhook = await fetch(`${BASE}/api/v1/voice/incoming-call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      From: '+15551234567',
      To: toNumber,
      CallSid: callSid,
    }),
  });
  const twiml = await webhook.text();
  const hasStream = twiml.includes('<Stream') && twiml.includes('<Connect');
  log('Call flow: incoming webhook', webhook.status === 200 && hasStream, hasStream ? 'TwiML with Media Stream' : twiml.slice(0, 80));

  const streamUrlRaw = extractStreamUrl(twiml);
  if (!streamUrlRaw) {
    process.exit(1);
  }

  const wsUrl = localWsUrl(streamUrlRaw);
  log('Call flow: WebSocket URL', true, wsUrl.replace(/token=[^&]+/, 'token=***'));

  const wsResult = await simulateMediaStream(wsUrl, callSid);
  log('Call flow: media stream session', wsResult.connected, wsResult.error || 'connected and sent audio frames');

  await new Promise((r) => setTimeout(r, 2000));

  const callsAfter = await apiGet('/calls');
  const found = (callsAfter.body?.data ?? []).some(
    (c) => c.call_sid === callSid || c.callSid === callSid
  );
  log('Call flow: call record persisted', found, callSid);

  const metricsAfter = await apiGet('/dashboard/metrics');
  const totalAfter = Number(metricsAfter.body?.data?.totalCalls ?? metricsAfter.body?.totalCalls ?? 0);
  log('Data flow: metrics after call', metricsAfter.status === 200, `totalCalls=${totalAfter}`);

  const passed =
    dbOk &&
    redisOk &&
    metricsBefore.status === 200 &&
    webhook.status === 200 &&
    hasStream &&
    wsResult.connected &&
    found;

  console.log(`\n=== ${passed ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'} ===\n`);
  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
