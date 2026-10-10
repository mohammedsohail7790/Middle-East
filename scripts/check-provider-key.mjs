#!/usr/bin/env node
/**
 * Checks that the model-provider key in YOUR environment is accepted, before a pilot call depends on it.
 *
 *   OPENAI_API_KEY=<set in your shell or the host's secret store, never typed into chat> node scripts/check-provider-key.mjs [--respond]
 *
 * Optional: OPENAI_REALTIME_MODEL (default gpt-realtime).
 * Prints JSON lines with a status label and the HTTP status. It never prints the key, a header, a response body or model text.
 * Exit code 0 only when every requested check passed.
 *  - default: free, read-only "retrieve model" request. It does NOT prove credit is available (see scripts/lib/provider-probe.mjs).
 *  - --respond: also makes ONE minimal billable request (text-only Realtime session, one word, no customer data) and reports whether
 *    the model actually answered. This is the check that proves quota and model availability.
 */
import { probeOpenAiKey, probeRealtimeResponse, PROBE_STATUS } from './lib/provider-probe.mjs';

const model = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime';
const key = process.env.OPENAI_API_KEY;
const result = await probeOpenAiKey({ key, model });
console.log(JSON.stringify({ check: 'key', provider: 'openai', model, ...result, note: result.status === PROBE_STATUS.OK ? 'key accepted; credit not verified' : undefined }));
let ok = result.status === PROBE_STATUS.OK;
if (process.argv.includes('--respond') && ok) {
  const r = await probeRealtimeResponse({ key, model });
  console.log(JSON.stringify({ check: 'model_response', provider: 'openai', model, ...r }));
  ok = r.status === PROBE_STATUS.OK && r.responded;
}
process.exit(ok ? 0 : 1);
