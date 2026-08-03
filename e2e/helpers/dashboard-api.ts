import type { APIRequestContext, Page } from '@playwright/test';
import { GATEWAY_URL } from '../fixtures';

/** Read Supabase access token from dashboard localStorage (after auth setup). */
export async function getSupabaseAccessTokenFromPage(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.includes('auth-token')) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || '') as { access_token?: string };
        if (parsed?.access_token) return parsed.access_token;
      } catch {
        /* ignore */
      }
    }
    return null;
  });
}

export async function getTenantIdFromApi(
  request: APIRequestContext,
  token: string,
  apiBase = GATEWAY_URL
): Promise<string | null> {
  const res = await request.get(`${apiBase}/api/v1/tenants/me`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 30_000,
  });
  if (!res.ok()) return null;
  const json = (await res.json()) as { data?: { id?: string } };
  return json?.data?.id ?? null;
}

/** Every dashboard page and the gateway APIs it loads. */
export const REALTIME_DASHBOARD_PAGES = [
  {
    id: 'overview',
    route: '/dashboard',
    apis: ['/dashboard/metrics', '/dashboard/call-volume', '/calls'],
    heading: /good morning|good afternoon|good evening|total calls/i,
  },
  {
    id: 'calls',
    route: '/dashboard/calls',
    apis: ['/calls'],
    heading: /calls/i,
  },
  {
    id: 'leads',
    route: '/dashboard/leads',
    apis: ['/leads'],
    heading: /leads/i,
  },
  {
    id: 'agent',
    route: '/dashboard/agent',
    apis: ['/ai-config'],
    heading: /ai agent|agent/i,
  },
  {
    id: 'calendar',
    route: '/dashboard/calendar',
    apis: ['/calendar/events'],
    heading: /calendar/i,
  },
  {
    id: 'sms',
    route: '/dashboard/sms',
    apis: ['/sms/conversations'],
    heading: /sms/i,
  },
  {
    id: 'analytics',
    route: '/dashboard/analytics',
    apis: ['/analytics/metrics', '/analytics/call-volume'],
    heading: /analytics/i,
  },
  {
    id: 'integrations',
    route: '/dashboard/integrations',
    apis: ['/integrations/status'],
    heading: /integrations/i,
  },
  {
    id: 'knowledge',
    route: '/dashboard/knowledge',
    apis: ['/knowledge'],
    heading: /knowledge/i,
  },
  {
    id: 'billing',
    route: '/dashboard/billing',
    apis: ['/billing/subscription', '/billing/usage'],
    heading: /billing/i,
  },
  {
    id: 'phone-numbers',
    route: '/dashboard/phone-numbers',
    apis: ['/phone-numbers'],
    heading: /phone|numbers/i,
  },
  {
    id: 'settings',
    route: '/dashboard/settings',
    apis: ['/tenants/'],
    heading: /settings/i,
  },
] as const;

export async function waitForDashboardSseHandshake(page: Page, timeoutMs = 45_000): Promise<void> {
  await page.waitForResponse(
    (res) => res.url().includes('/dashboard/sse-token') && res.status() < 400,
    { timeout: timeoutMs }
  );
  await page.waitForResponse(
    (res) => res.url().includes('/dashboard/stream') && res.status() === 200,
    { timeout: timeoutMs }
  );
}

/** Parse SSE chunks from a raw buffer. */
export function parseSseEvents(buffer: string): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [];
  for (const block of buffer.split('\n\n')) {
    for (const line of block.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      try {
        events.push(JSON.parse(line.slice(6)) as Record<string, unknown>);
      } catch {
        /* ignore */
      }
    }
  }
  return events;
}

/** Probe gateway SSE using dashboard-style sse-token + stream (Node fetch). */
export async function probeDashboardSseStream(
  gatewayBase: string,
  bearerToken: string,
  timeoutMs = 45_000
): Promise<{ ok: boolean; events: Record<string, unknown>[]; error?: string }> {
  const base = gatewayBase.replace(/\/$/, '');
  const tokenRes = await fetch(`${base}/api/v1/dashboard/sse-token`, {
    headers: { Authorization: `Bearer ${bearerToken}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!tokenRes.ok) {
    return { ok: false, events: [], error: `sse-token HTTP ${tokenRes.status}` };
  }
  const tokenJson = (await tokenRes.json()) as { data?: { token?: string } };
  const streamToken = tokenJson?.data?.token;
  if (!streamToken) {
    return { ok: false, events: [], error: 'sse-token missing token' };
  }

  const url = `${base}/api/v1/dashboard/stream?token=${encodeURIComponent(streamToken)}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      headers: { Accept: 'text/event-stream' },
      signal: ac.signal,
    });
    if (!res.ok) {
      return { ok: false, events: [], error: `stream HTTP ${res.status}` };
    }
    const reader = res.body?.getReader();
    if (!reader) {
      return { ok: false, events: [], error: 'stream has no body' };
    }

    const decoder = new TextDecoder();
    let buf = '';
    while (buf.length < 12_000) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const events = parseSseEvents(buf);
      const hasHandshake = events.some((e) => e.connected === true);
      const hasMetrics = events.some((e) => typeof e.totalCalls === 'number');
      if (hasHandshake && hasMetrics) {
        return { ok: true, events };
      }
    }
    const events = parseSseEvents(buf);
    const ok = events.some((e) => e.connected === true || typeof e.totalCalls === 'number');
    return ok
      ? { ok: true, events }
      : { ok: false, events, error: 'no connected/metrics event within timeout' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, events: [], error: msg };
  } finally {
    clearTimeout(timer);
  }
}
