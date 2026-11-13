#!/usr/bin/env node
/**
 * Outside check of the live product, run every 5 minutes by .github/workflows/uptime.yml.
 * Three probes: the gateway is alive (/health), the gateway can reach its database and Redis (/ready), and the website answers.
 * A probe is retried once before it counts, so one dropped request never raises an alarm. Exit code 1 = something is down.
 */
export const PROBES = [
  { name: 'gateway alive', url: 'https://gateway.hallaai.com/health', check: (r) => r.status === 200 },
  {
    name: 'gateway ready (database and Redis)',
    url: 'https://gateway.hallaai.com/ready',
    check: (r) => r.status === 200 && r.json?.ready === true,
  },
  { name: 'website', url: 'https://www.hallaai.com/en', check: (r) => r.status === 200 },
];

/** Turns raw probe results into a verdict. Kept free of network calls so it can be tested. */
export function evaluate(results) {
  const failed = results.filter((r) => !r.ok);
  return {
    ok: failed.length === 0,
    failed: failed.map((r) => r.name),
    summary: results.map((r) => `${r.ok ? 'OK  ' : 'DOWN'} ${r.name}: ${r.status ?? 'no answer'} in ${r.ms ?? '?'} ms${r.error ? ` (${r.error})` : ''}`).join('\n'),
  };
}

async function probeOnce(p, timeoutMs) {
  const t0 = Date.now();
  try {
    const res = await fetch(p.url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
    let json;
    try {
      json = await res.clone().json();
    } catch {
      json = undefined;
    }
    const r = { name: p.name, status: res.status, json, ms: Date.now() - t0 };
    return { ...r, ok: p.check(r) };
  } catch (err) {
    return { name: p.name, ok: false, status: null, ms: Date.now() - t0, error: String(err?.name === 'TimeoutError' ? 'timed out' : err?.message ?? err).slice(0, 80) };
  }
}

export async function runProbes({ probes = PROBES, timeoutMs = 20_000, retries = 1, wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const results = [];
  for (const p of probes) {
    let r = await probeOnce(p, timeoutMs);
    for (let i = 0; i < retries && !r.ok; i++) {
      await wait(5_000);
      r = await probeOnce(p, timeoutMs);
    }
    results.push(r);
  }
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const verdict = evaluate(await runProbes());
  console.log(verdict.summary);
  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_OUTPUT, `ok=${verdict.ok}\nfailed=${verdict.failed.join('; ')}\n`);
  }
  process.exit(verdict.ok ? 0 : 1);
}
