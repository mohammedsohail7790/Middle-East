import { test, expect, GATEWAY_URL, hasGatewayApiKey } from '../fixtures';

const API = `${GATEWAY_URL}/api/v1`;

test.describe('gateway API data flow', () => {
  test('health and realtime health', async ({ request }) => {
    const health = await request.get(`${GATEWAY_URL}/health`, { timeout: 15_000 });
    expect(health.ok(), `GET ${GATEWAY_URL}/health`).toBeTruthy();
    const rt = await request.get(`${GATEWAY_URL}/health/realtime`, { timeout: 15_000 });
    expect([200, 503].includes(rt.status())).toBeTruthy();
  });

  test.describe('tenant-scoped metrics', () => {
    test.skip(!hasGatewayApiKey(), 'Set E2E_TENANT_ID and VOICE_INTERNAL_API_KEY');

    const headers = {
      'x-tenant-id': process.env.E2E_TENANT_ID!,
      'x-internal-api-key': process.env.VOICE_INTERNAL_API_KEY!,
      'Content-Type': 'application/json',
    };

    test('dashboard metrics returns calls and leads counts', async ({ request }) => {
      const res = await request.get(`${API}/dashboard/metrics`, { headers });
      expect(res.status()).toBeLessThan(500);
      if (res.ok()) {
        const json = await res.json();
        const data = json.data ?? json;
        expect(data).toHaveProperty('totalCalls');
        expect(data).toHaveProperty('leads');
      }
    });

    test('calls list endpoint', async ({ request }) => {
      const res = await request.get(`${API}/calls`, { headers });
      expect(res.status()).toBeLessThan(500);
    });

    test('leads list endpoint', async ({ request }) => {
      const res = await request.get(`${API}/leads`, { headers });
      expect(res.status()).toBeLessThan(500);
    });

    test('calendar events endpoint', async ({ request }) => {
      const res = await request.get(`${API}/calendar/events`, { headers });
      expect(res.status()).not.toBe(500);
      if (!res.ok()) {
        const text = await res.text();
        expect(text).not.toMatch(/column .* does not exist/i);
      }
    });

    test('team list endpoint', async ({ request }) => {
      const res = await request.get(`${API}/team`, { headers });
      expect(res.status()).toBeLessThan(500);
      if (!res.ok()) {
        const text = await res.text();
        expect(text).not.toMatch(/column "name" does not exist/i);
      }
    });

    test('automation rules endpoint', async ({ request }) => {
      const res = await request.get(`${API}/automation/rules`, { headers });
      expect(res.status()).toBeLessThan(500);
    });
  });
});
