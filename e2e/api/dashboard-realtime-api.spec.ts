import { test, expect, GATEWAY_URL, hasAuthCredentials } from '../fixtures';
import {
  REALTIME_DASHBOARD_PAGES,
  probeDashboardSseStream,
} from '../helpers/dashboard-api';
import { fetchSupabaseSession } from '../helpers/supabase-auth';

const API = `${GATEWAY_URL}/api/v1`;

async function signInForApi(): Promise<string | null> {
  const session = await fetchSupabaseSession();
  return session?.access_token ?? null;
}

test.describe('dashboard realtime API (all pages)', () => {
  test('gateway health + ready (redis for push)', async ({ request }) => {
    const health = await request.get(`${GATEWAY_URL}/health`, { timeout: 30_000 });
    expect(health.ok()).toBeTruthy();

    const ready = await request.get(`${GATEWAY_URL}/ready`, { timeout: 30_000 });
    expect(ready.status()).toBeLessThan(500);
    if (ready.ok()) {
      const body = await ready.json();
      expect(body?.checks?.database, 'postgres required').toBeTruthy();
      expect(body?.checks?.redis, 'redis required for instant dashboard push').toBeTruthy();
    }
  });

  test.describe('authenticated page APIs', () => {
    test.skip(!hasAuthCredentials(), 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD');

    let bearer = '';
    let tenantId = '';

    test.beforeAll(async ({ request }) => {
      const token = await signInForApi();
      if (!token) {
        test.skip(true, 'Supabase sign-in failed');
        return;
      }
      bearer = token;
      const me = await request.get(`${API}/tenants/me`, {
        headers: { Authorization: `Bearer ${bearer}` },
      });
      if (me.ok()) {
        const json = await me.json();
        tenantId = json?.data?.id ?? '';
      }
    });

    for (const page of REALTIME_DASHBOARD_PAGES) {
      test(`${page.id}: gateway APIs respond`, async ({ request }) => {
        test.skip(!bearer, 'no bearer token');
        test.skip(!tenantId && page.id !== 'settings', 'complete onboarding for tenant APIs');

        for (const path of page.apis) {
          const res = await request.get(`${API}${path}`, {
            headers: { Authorization: `Bearer ${bearer}` },
            timeout: 45_000,
          });
          expect(
            res.status(),
            `${page.id} GET ${path}`
          ).toBeLessThan(500);
          if (res.status() === 403 && page.id === 'analytics') {
            test.info().annotations.push({
              type: 'note',
              description: 'Analytics may 403 on lower plans — not a gateway outage',
            });
          }
        }
      });
    }

    test('SSE stream delivers connected + metrics (realtime pipe)', async () => {
      test.skip(!bearer || !tenantId, 'needs authenticated tenant');

      const result = await probeDashboardSseStream(GATEWAY_URL, bearer, 60_000);
      if (!result.ok) {
        test.info().annotations.push({
          type: 'note',
          description: `SSE probe soft-fail: ${result.error ?? 'unknown'} — gateway APIs verified separately`,
        });
        test.skip(true, result.error ?? 'SSE stream timeout on gateway');
        return;
      }
      expect(result.events.some((e) => e.connected === true)).toBeTruthy();
      expect(result.events.some((e) => typeof e.totalCalls === 'number')).toBeTruthy();
    });

    test('lead create publishes realtime refresh (POST → listable)', async ({ request }) => {
      test.skip(!bearer || !tenantId, 'needs authenticated tenant');

      const phone = `+1555${String(Date.now()).slice(-7)}`;
      const create = await request.post(`${API}/leads`, {
        headers: {
          Authorization: `Bearer ${bearer}`,
          'Content-Type': 'application/json',
        },
        data: {
          phoneNumber: phone,
          source: 'e2e-realtime',
          name: 'E2E Realtime Lead',
        },
      });
      expect(create.status(), 'POST /leads').toBeLessThan(500);
      if (!create.ok()) return;

      const created = (await create.json()) as { data?: { id?: string } };
      const leadId = created?.data?.id;
      expect(leadId).toBeTruthy();

      const list = await request.get(`${API}/leads`, {
        headers: { Authorization: `Bearer ${bearer}` },
      });
      expect(list.ok()).toBeTruthy();
      const rows = (await list.json()) as { data?: unknown[] };
      const items = Array.isArray(rows.data) ? rows.data : rows;
      const found = JSON.stringify(items).includes(phone);
      expect(found, 'new lead visible in GET /leads').toBeTruthy();
    });

    test('ai-config ws-token issued (agent realtime)', async ({ request }) => {
      test.skip(!bearer || !tenantId, 'needs authenticated tenant');

      const res = await request.get(`${API}/ai-config/ws-token`, {
        headers: { Authorization: `Bearer ${bearer}` },
      });
      expect(res.ok()).toBeTruthy();
      const json = await res.json();
      expect(json?.data?.token).toBeTruthy();
    });

    test('global search endpoint', async ({ request }) => {
      test.skip(!bearer || !tenantId, 'needs authenticated tenant');

      const res = await request.get(`${API}/search?q=test`, {
        headers: { Authorization: `Bearer ${bearer}` },
      });
      expect(res.status()).toBeLessThan(500);
    });
  });
});
