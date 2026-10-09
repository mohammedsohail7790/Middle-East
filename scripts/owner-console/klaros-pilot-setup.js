/*
 * Halla -> Klaros PILOT setup, run by a business OWNER in their OWN signed-in dashboard tab (browser console).
 *
 * What it does, in order, and nothing else:
 *   preview(pilot)             READ-ONLY. Shows the tenant it is signed in as, the key and webhook it WOULD create.
 *   createKey(pilot, confirm)  Creates ONE tenant API key (4 minimum scopes). The key goes to your clipboard, never to the screen.
 *   registerWebhook(pilot, c)  Registers ONE webhook to the Klaros pilot for the 8 verified events. The signing secret goes to your clipboard.
 *   revokeKey(id, c) / deleteWebhook(id, c)   Clean-up helpers (same confirmation).
 *
 * Safety design (each point is covered by tests/unit/gateway/owner-console-klaros-setup.test.ts):
 *   - It talks ONLY to https://gateway.hallaai.com and only with the signed-in owner's own session (no cookies are sent cross-origin,
 *     redirects are refused). The session token is read in memory per request, used ONLY as the Authorization header to that one
 *     origin, and is never printed, stored, copied, or sent anywhere else.
 *   - It refuses the existing Call IQ and Halla AI tenants, a tenant whose id/name you have not typed back exactly, a session from a
 *     different Supabase project, and any redirect.
 *   - Nothing is changed by preview(). createKey/registerWebhook change nothing unless the tenant id and exact tenant name you pass
 *     match the tenant you are signed in as, and the acknowledgement string matches.
 *   - Idempotent: an existing active key with the same name, or an existing webhook for the same URL, is never duplicated.
 *   - The key and the webhook secret exist only once. They are delivered to the clipboard with the DevTools copy() helper and never
 *     logged. If they cannot be copied, the key is revoked straight away (the webhook is deleted) so a value you never saw cannot remain valid.
 *   - Webhook registration uses your signed-in session directly, so NO separate webhooks.manage key is created.
 */
(() => {
  'use strict';

  const GATEWAY = 'https://gateway.hallaai.com';
  const API = `${GATEWAY}/api/v1`;
  const KLAROS = 'https://klaros-halla-pilot.onrender.com';
  const SUPABASE_REF = 'xzhxnxxlbiiidipcgfrv'; // the production Supabase project the dashboard signs in to
  const NEVER_TOUCH = new Set([
    'ad9c3394-f7ab-42af-aa74-43f2b0d8b52c', // Call IQ
    'f90e10ca-e975-4bf6-bc8d-97d7318cd9da', // Halla AI
  ]);
  const SCOPES = Object.freeze(['workforce.read', 'workforce.write', 'leads.read', 'leads.write']);
  const EVENTS = Object.freeze([
    'lead.created', 'lead.updated', 'lead.qualified', 'lead.escalated',
    'call.completed', 'appointment.confirmed', 'appointment.rescheduled', 'appointment.cancelled',
  ]); // appointment.requested is deliberately absent: nothing emits it
  const PILOTS = Object.freeze({
    medical_tourism: { klarosTenantId: 'c14d42d1-4c63-46c1-bdc3-89d4dc2b7b7b', keyName: 'klaros-pilot-runtime (medical tourism)', webhookName: 'Klaros pilot (medical tourism)', keyEnv: 'HALLA_API_KEY_MT', secretEnv: 'HALLA_WEBHOOK_SECRET_MT' },
    dropshipping: { klarosTenantId: '8f3a3df4-b999-4d72-8d17-667c91edf494', keyName: 'klaros-pilot-runtime (dropshipping)', webhookName: 'Klaros pilot (dropshipping)', keyEnv: 'HALLA_API_KEY_DS', secretEnv: 'HALLA_WEBHOOK_SECRET_DS' },
  });
  const ACK = 'I reviewed preview()';
  const KEY_LIFETIME_DAYS = 90;
  const COOKIE_NAME = /^sb-([a-z0-9]+)-auth-token(?:\.(\d+))?$/;

  const say = (...a) => console.log('[halla-setup]', ...a);
  const fail = (m) => { throw new Error(`[halla-setup] ${m}`); };

  // --- session: read in memory, per request, never stored or shown ---------------------------------------------------------
  const b64urlToText = (s) => {
    let t = s.replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    return new TextDecoder().decode(Uint8Array.from(atob(t), (c) => c.charCodeAt(0)));
  };
  function accessToken() {
    const groups = new Map(); // project ref -> chunks
    for (const part of String(document.cookie || '').split(';')) {
      const i = part.indexOf('=');
      if (i < 0) continue;
      const m = part.slice(0, i).trim().match(COOKIE_NAME);
      if (!m) continue;
      if (!groups.has(m[1])) groups.set(m[1], []);
      groups.get(m[1]).push([Number(m[2] || 0), part.slice(i + 1).trim()]);
    }
    if (groups.size === 0) fail('No dashboard session found. Open https://www.hallaai.com/en/dashboard while signed in as the business owner, then try again.');
    if (groups.size > 1 || !groups.has(SUPABASE_REF)) fail('This session belongs to a different Supabase project than the Halla production dashboard. Refusing.');
    const raw = groups.get(SUPABASE_REF).sort((a, b) => a[0] - b[0]).map((x) => x[1]).join('');
    let text = decodeURIComponent(raw);
    if (text.startsWith('base64-')) text = b64urlToText(text.slice(7));
    let session;
    try { session = JSON.parse(text); } catch { fail('The dashboard session could not be read. Reload the dashboard page and try again.'); }
    if (!session || typeof session.access_token !== 'string' || !session.access_token) fail('You are not signed in. Sign in to the dashboard and try again.');
    if (typeof session.expires_at === 'number' && session.expires_at * 1000 < Date.now() + 30000) fail('Your session is about to expire. Reload the dashboard page (it refreshes the session) and try again.');
    return session.access_token;
  }

  async function api(method, path, body, tenantId) {
    const headers = { Authorization: `Bearer ${accessToken()}`, Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (tenantId) headers['x-tenant-id'] = tenantId;
    const res = await fetch(`${API}${path}`, {
      method, headers, credentials: 'omit', redirect: 'error',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { /* empty body */ }
    return { status: res.status, json };
  }
  const errText = (r) => (r && r.json && typeof r.json.error === 'string' ? r.json.error.slice(0, 160) : 'no message');

  // --- identity: who is this session, and is it safe to continue ---------------------------------------------------------------
  async function whoami() {
    const r = await api('GET', '/tenants/me');
    const t = r.status === 200 && r.json && r.json.data;
    if (!t || !t.id) fail(`Could not read your tenant (status ${r.status}: ${errText(r)}). Finish onboarding first.`);
    const id = String(t.id).toLowerCase();
    if (NEVER_TOUCH.has(id)) fail('REFUSING: this session is signed in to an existing company tenant (Call IQ or Halla AI). Use the new business owner account.');
    return {
      id,
      name: String(t.companyName || t.company_name || ''),
      escalationNumberSet: /^\+[1-9]\d{6,14}$/.test(String(t.transferNumber || t.transfer_phone_number || '')), // yes/no only: the number is never printed
    };
  }
  const pilotOf = (pilot) => PILOTS[pilot] || fail(`pilot must be one of: ${Object.keys(PILOTS).join(', ')}`);
  const hookUrl = (p) => `${KLAROS}/api/v1/webhooks/halla/${p.klarosTenantId}`;
  function confirmed(me, c) {
    if (!c || c.tenantId !== me.id || c.tenantName !== me.name || c.acknowledge !== ACK) {
      fail(`Not confirmed. Pass { tenantId: "${me.id}", tenantName: ${JSON.stringify(me.name)}, acknowledge: "${ACK}" } after running preview(), exactly as shown.`);
    }
  }
  const activeKey = (k, name) => k.name === name && !k.revokedAt && (!k.expiresAt || new Date(k.expiresAt) > new Date());

  // The value reaches the owner only through the clipboard. DevTools' copy() needs no page focus; navigator.clipboard is the fallback.
  async function toClipboard(value) {
    try {
      if (typeof copy === 'function') { copy(value); return true; } // eslint-disable-line no-undef
    } catch { /* fall through */ }
    try { await navigator.clipboard.writeText(value); return true; } catch { return false; }
  }

  async function preview(pilot) {
    const p = pilotOf(pilot);
    const me = await whoami();
    const keys = await api('GET', '/api-keys', undefined, me.id);
    const hooks = await api('GET', '/webhooks', undefined, me.id);
    if (keys.status !== 200 || hooks.status !== 200) fail(`Could not read existing keys/webhooks (api-keys ${keys.status}, webhooks ${hooks.status}). Your plan or permissions may not allow this.`);
    const existingKey = (keys.json.data || []).find((k) => activeKey(k, p.keyName));
    const existingHook = (hooks.json.data || []).find((h) => h.url === hookUrl(p));
    say(`PREVIEW only. Nothing has been changed. Pilot: ${pilot}`);
    say(`Signed in as tenant id ${me.id}`);
    say(`Tenant name: ${JSON.stringify(me.name)}`);
    say(`Human escalation number configured: ${me.escalationNumberSet ? 'yes' : 'NO - set it in Business Profile first (templates refuse without it)'}`);
    say(`KEY to create: name ${JSON.stringify(p.keyName)}, scopes ${SCOPES.join(', ')}, expires in ${KEY_LIFETIME_DAYS} days. ${existingKey ? `ALREADY EXISTS (id ${existingKey.id}, prefix ${existingKey.keyPrefix}): will not create another.` : 'Does not exist yet.'}`);
    say(`WEBHOOK to register: ${hookUrl(p)}`);
    say(`  events: ${EVENTS.join(', ')}`);
    say(existingHook ? `  ALREADY REGISTERED (id ${existingHook.id}): will not create another.` : '  Not registered yet.');
    say(`To proceed, run createKey("${pilot}", { tenantId: "${me.id}", tenantName: ${JSON.stringify(me.name)}, acknowledge: "${ACK}" })`);
  }

  async function createKey(pilot, c) {
    const p = pilotOf(pilot);
    const me = await whoami();
    confirmed(me, c);
    const list = await api('GET', '/api-keys', undefined, me.id);
    if (list.status !== 200) fail(`Could not list keys (status ${list.status}: ${errText(list)}).`);
    const existing = (list.json.data || []).find((k) => activeKey(k, p.keyName));
    if (existing) { say(`A key named ${JSON.stringify(p.keyName)} already exists (id ${existing.id}, prefix ${existing.keyPrefix}). Nothing created. If you lost its value, run revokeKey("${existing.id}", ...) and then createKey again.`); return; }
    const expiresAt = new Date(Date.now() + KEY_LIFETIME_DAYS * 86400000).toISOString();
    const r = await api('POST', '/api-keys', { name: p.keyName, scopes: [...SCOPES], expiresAt }, me.id);
    if (r.status !== 201 || !r.json || !r.json.data) fail(`Key was NOT created (status ${r.status}: ${errText(r)}). Only an owner can create keys.`);
    const { id, keyPrefix } = r.json.data;
    let raw = r.json.data.key;
    r.json = null;
    if (typeof raw !== 'string' || !raw.startsWith('sk_calliq_')) { await api('POST', `/api-keys/${id}/revoke`, undefined, me.id); fail('Unexpected key format; the new key was revoked. Nothing was kept.'); }
    const ok = await toClipboard(raw);
    raw = null;
    if (!ok) {
      await api('POST', `/api-keys/${id}/revoke`, undefined, me.id);
      fail('The key could not be copied to your clipboard, so it was REVOKED (a value you never saw must not stay valid). Run this in the Chrome DevTools Console tab and try again.');
    }
    say(`Key created (id ${id}, prefix ${keyPrefix}). Its value is on your clipboard and was NOT shown.`);
    say(`Paste it NOW into the protected Klaros environment variable ${p.keyEnv} (Render -> klaros-halla-pilot -> Environment). Then copy anything else to clear the clipboard.`);
    say(`Next: registerWebhook("${pilot}", { tenantId: "${me.id}", tenantName: ${JSON.stringify(me.name)}, acknowledge: "${ACK}" })`);
  }

  async function registerWebhook(pilot, c) {
    const p = pilotOf(pilot);
    const me = await whoami();
    confirmed(me, c);
    const list = await api('GET', '/webhooks', undefined, me.id);
    if (list.status !== 200) fail(`Could not list webhooks (status ${list.status}: ${errText(list)}).`);
    const url = hookUrl(p);
    const existing = (list.json.data || []).find((h) => h.url === url);
    if (existing) { say(`A webhook for ${url} already exists (id ${existing.id}). Nothing created. Its secret cannot be shown again; to rotate, run deleteWebhook("${existing.id}", ...) and registerWebhook again.`); return; }
    const r = await api('POST', '/webhooks', { name: p.webhookName, url, events: [...EVENTS] }, me.id);
    if (r.status !== 201 || !r.json || !r.json.data) fail(`Webhook was NOT registered (status ${r.status}: ${errText(r)}).`);
    const { id } = r.json.data;
    let secret = r.json.data.secret;
    r.json = null;
    if (typeof secret !== 'string' || secret.length < 16) { await api('DELETE', `/webhooks/${id}`, undefined, me.id); fail('Unexpected response; the new webhook was deleted. Nothing was kept.'); }
    const ok = await toClipboard(secret);
    secret = null;
    if (!ok) {
      await api('DELETE', `/webhooks/${id}`, undefined, me.id);
      fail('The signing secret could not be copied, so the webhook was DELETED (a secret you never saw is useless). Run this in the Chrome DevTools Console tab and try again.');
    }
    say(`Webhook registered (id ${id}) for ${url}. Its signing secret is on your clipboard and was NOT shown.`);
    say(`Paste it NOW into the protected Klaros environment variable ${p.secretEnv} (Render -> klaros-halla-pilot -> Environment). Then copy anything else to clear the clipboard.`);
  }

  async function revokeKey(id, c) {
    const me = await whoami(); confirmed(me, c);
    const r = await api('POST', `/api-keys/${encodeURIComponent(String(id))}/revoke`, undefined, me.id);
    say(r.status === 200 ? 'Key revoked.' : `Not revoked (status ${r.status}: ${errText(r)}).`);
  }
  async function deleteWebhook(id, c) {
    const me = await whoami(); confirmed(me, c);
    const r = await api('DELETE', `/webhooks/${encodeURIComponent(String(id))}`, undefined, me.id);
    say(r.status === 200 ? 'Webhook deleted.' : `Not deleted (status ${r.status}: ${errText(r)}).`);
  }

  globalThis.hallaSetup = Object.freeze({ preview, createKey, registerWebhook, revokeKey, deleteWebhook });
  say('Loaded. Run: hallaSetup.preview("medical_tourism")   or   hallaSetup.preview("dropshipping")');
})();
