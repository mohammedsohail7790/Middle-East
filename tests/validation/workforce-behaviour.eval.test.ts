/**
 * LIVE-MODEL behavioural evaluation of the pilot workforces' prompts (text-mode proxy; see helpers/workforce-behaviour-eval.ts).
 *
 * SKIPPED unless HALLA_EVAL_OPENAI_API_KEY is set. That variable is deliberately separate from OPENAI_API_KEY: the
 * production key is never used here, and nothing in the repository supplies the sandbox key. Without it this file
 * reports LIVE_MODEL_BEHAVIOUR = NOT_TESTED and makes no network call.
 *
 * Run (with a sandbox/test key and budget you control):
 *   HALLA_EVAL_OPENAI_API_KEY=... HALLA_EVAL_MODEL=gpt-4o npx vitest run tests/validation/workforce-behaviour.eval.test.ts
 *
 * Every trial's transcript is printed so a person can read what the model actually said; a pass here means "no obvious
 * rubric failure in N trials", not "safe".
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../apps/gateway/src/services/business-hours/business-hours.service.js', () => ({
  businessHoursService: { isCurrentlyOpen: vi.fn(async () => true) },
}));

import { SCENARIOS, evaluateReply, type EvalReply, type EvalScenario } from '../helpers/workforce-behaviour-eval.js';
import { WORKFORCE_TEMPLATES } from '../../apps/gateway/src/services/workforce-templates/index.js';
import { buildFullPrompt } from '../../apps/gateway/src/services/realtime/realtime-prompt-builder.js';
import { buildHumanRealtimePreamble } from '../../apps/gateway/src/services/realtime/receptionist-voice.js';

const KEY = process.env.HALLA_EVAL_OPENAI_API_KEY;
const MODEL = process.env.HALLA_EVAL_MODEL || 'gpt-4o';
const TRIALS = Math.max(1, Number(process.env.HALLA_EVAL_TRIALS || 3));

const TOOL_DEFS: Record<string, unknown> = {
  transfer_call: { type: 'function', function: { name: 'transfer_call', description: 'Transfer the caller to a human team member. Use reason codes such as "emergency" or "human_requested".', parameters: { type: 'object', properties: { reason: { type: 'string' }, department: { type: 'string' } }, required: ['reason'] } } },
  search_knowledge_base: { type: 'function', function: { name: 'search_knowledge_base', description: 'Search the business knowledge base for information', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
  create_lead: { type: 'function', function: { name: 'create_lead', description: 'Capture a new lead. Only after the caller has agreed to be contacted.', parameters: { type: 'object', properties: { name: { type: 'string' }, phone: { type: 'string' }, interest: { type: 'string' } }, required: ['name', 'phone'] } } },
};

async function systemPromptFor(s: EvalScenario): Promise<string> {
  const template = WORKFORCE_TEMPLATES[s.vertical];
  const agent = template.agents.find((a) => a.key === s.agentKey)!;
  const tenantConfig = {
    tenantId: 'eval-tenant', businessName: 'Example Business', industry: 'general', services: [], tone: agent.tone, questions: [],
    defaultLanguage: 'en', timezone: 'UTC', diagnosticFee: 0, callHandlingMode: 'both', transferPhoneNumber: '+10000000000',
    integrations: {}, agentName: agent.name, welcomeMessage: 'Hello', customSystemPrompt: agent.systemPrompt,
  } as never;
  const c = template.tenantConfig;
  const aiConfig = { agentName: agent.name, language: 'en', tone: c.tone, systemInstructions: c.systemInstructions, doInstructions: c.doInstructions, dontInstructions: c.dontInstructions, servicesOffered: [], requiredFields: c.requiredFields } as never;
  return `${buildHumanRealtimePreamble('en')}\n\n${await buildFullPrompt('eval-tenant', tenantConfig, aiConfig)}`;
}

async function runTrial(s: EvalScenario): Promise<{ reply: EvalReply; transcript: unknown[] }> {
  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: await systemPromptFor(s) },
    { role: 'user', content: s.caller },
  ];
  const toolCalls: EvalReply['toolCalls'] = [];
  let text = '';
  for (let round = 0; round < 4; round++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model: MODEL, temperature: 0, messages, tools: s.tools.map((t) => TOOL_DEFS[t]) }),
    });
    if (!res.ok) throw new Error(`model call failed: HTTP ${res.status}`);
    const msg = (await res.json()).choices[0].message as { content?: string; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> };
    messages.push(msg as never);
    if (msg.content) text += `${text ? '\n' : ''}${msg.content}`;
    if (!msg.tool_calls?.length) break;
    for (const call of msg.tool_calls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* keep {} */ }
      toolCalls.push({ name: call.function.name, arguments: args });
      const result = call.function.name === 'search_knowledge_base' ? { success: true, message: 'No relevant results found.', data: [] } : { success: true, message: 'Done.' };
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return { reply: { text, toolCalls }, transcript: messages.slice(1) };
}

describe.skipIf(!KEY)(`LIVE MODEL behaviour (${MODEL}, ${TRIALS} trials each, temperature 0)`, () => {
  it.each(SCENARIOS.map((s) => [s.id, s] as const))('%s', async (_id, scenario) => {
    const failures: string[] = [];
    for (let i = 0; i < TRIALS; i++) {
      const { reply, transcript } = await runTrial(scenario);
      const verdict = evaluateReply(scenario, reply);
      // eslint-disable-next-line no-console
      console.log(`EVAL ${scenario.id} trial ${i + 1}: ${verdict.pass ? 'PASS' : 'FAIL'}\n${JSON.stringify({ caller: scenario.caller, transcript, failures: verdict.failures }, null, 2)}`);
      if (!verdict.pass) failures.push(`trial ${i + 1}: ${verdict.failures.join('; ')}`);
    }
    expect(failures, `${scenario.title}`).toEqual([]);
  }, 120_000);
});

describe.skipIf(Boolean(KEY))('LIVE MODEL behaviour', () => {
  it('LIVE_MODEL_BEHAVIOUR = NOT_TESTED: HALLA_EVAL_OPENAI_API_KEY is not set, so no model was called', () => {
    expect(SCENARIOS).toHaveLength(21);
  });
});
