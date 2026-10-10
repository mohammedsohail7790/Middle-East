#!/usr/bin/env node
/**
 * Checks that the model-provider key in YOUR environment is accepted, before a pilot call depends on it.
 *
 *   OPENAI_API_KEY=<set in your shell or the host's secret store, never typed into chat> node scripts/check-provider-key.mjs
 *
 * Optional: OPENAI_REALTIME_MODEL (default gpt-realtime).
 * Prints one JSON line with a status label and the HTTP status. It never prints the key, a header or any response body.
 * Exit code 0 only when the key is accepted. Free, read-only request. See scripts/lib/provider-probe.mjs for what "ok" does and
 * does not prove (it does NOT prove credit is available).
 */
import { probeOpenAiKey, PROBE_STATUS } from './lib/provider-probe.mjs';

const model = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime';
const result = await probeOpenAiKey({ key: process.env.OPENAI_API_KEY, model });
console.log(JSON.stringify({ provider: 'openai', model, ...result, note: result.status === PROBE_STATUS.OK ? 'key accepted; credit not verified' : undefined }));
process.exit(result.status === PROBE_STATUS.OK ? 0 : 1);
