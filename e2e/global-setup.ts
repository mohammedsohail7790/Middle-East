const gatewayUrl = process.env.PLAYWRIGHT_GATEWAY_URL || 'http://localhost:3003';
const dashboardUrl =
  process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${process.env.PLAYWRIGHT_PORT ?? 3000}`;

async function waitForOk(url: string, label: string, attempts = 90) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok || res.status === 503) {
        console.log(`[e2e setup] ${label} ready (${res.status})`);
        return;
      }
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`${label} not ready at ${url} after ${attempts * 2}s`);
}

export default async function globalSetup() {
  if (process.env.PLAYWRIGHT_SKIP_WEBSERVER) {
    await waitForOk(`${gatewayUrl}/health`, 'Gateway');
    await waitForOk(`${dashboardUrl}/login`, 'Dashboard');
  }
}
