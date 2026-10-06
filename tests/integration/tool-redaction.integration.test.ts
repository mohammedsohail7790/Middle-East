/**
 * F8 end to end on REAL PostgreSQL and REAL Redis: sensitive tool arguments go in through the live tool path
 * (RealtimeSessionManager.handleFunctionCall -> RealtimeToolsManager.executeTool -> governance -> real tool code ->
 * real database), and NOTHING sensitive may appear in
 *   - any logger call or console output made while that happens, or
 *   - the real Redis audit list written by persistExecutionAudit, or
 *   - the error text returned to the model.
 * The audit entries must still carry the operational metadata.
 *
 * Substituted: Twilio (no call, no SMS) and the knowledge service (it would call an external embeddings API; it is
 * replaced by a fake that throws an error containing the caller's text, which is the worst case for error logging).
 * Needs HALLA_TEST_DATABASE_URL and REDIS_URL pointing at throwaway instances.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';

const DATABASE_URL = process.env.HALLA_TEST_DATABASE_URL;
const REDIS = process.env.REDIS_URL;
const run = Boolean(DATABASE_URL && REDIS);
if (DATABASE_URL) {
  process.env.GATEWAY_DATABASE_URL = DATABASE_URL;
  process.env.PGSSLMODE = 'disable';
}

const SENSITIVE = {
  name: 'Jane Q. Patient',
  phone: '+971501234567',
  email: 'jane.patient@example.com',
  address: '12 Palm Street, Dubai Marina',
  medical: 'chest pain, type 2 diabetes, takes metformin 500mg, recent cancer diagnosis',
  card: '4111 1111 1111 1111',
  secret: 'sk_live_abcdef1234567890ABCDEF',
};
const FORBIDDEN = ['Jane', 'Patient', '501234567', 'jane.patient', 'example.com', 'Palm Street', 'Dubai Marina', 'chest pain', 'diabetes', 'metformin', 'cancer', '4111 1111', 'sk_live'];

// tests/setup.ts replaces the voice Redis client with a mock for every test; this test needs the REAL one.
vi.unmock('../../apps/gateway/src/services/voice/redis.client.js');
vi.mock('twilio', () => ({ default: () => ({ calls: { create: vi.fn(async () => ({ sid: 'CA_NEVER' })), get: () => ({ update: vi.fn(async () => ({})) }) }, messages: { create: vi.fn(async () => ({ sid: 'SM_NEVER' })) } }) }));
vi.mock('../../apps/gateway/src/services/knowledge/knowledge.service.js', () => ({
  knowledgeService: {
    searchRelevantKnowledge: vi.fn(async (query: string) => {
      throw new Error(`embedding lookup failed for query "${query}"`);
    }),
  },
}));
vi.mock('../../apps/gateway/src/services/auth/jwt-tenant-verifier.js', () => ({ verifyUserBearerToken: vi.fn() }));
vi.mock('../../apps/gateway/src/services/auth/internal-service-auth.js', () => ({ verifyInternalServiceRequest: vi.fn() }));
vi.mock('../../apps/gateway/src/security/sse-token.js', () => ({ verifySseDashboardToken: vi.fn(() => null) }));

const mods = run
  ? {
      pool: (await import('../../apps/gateway/src/services/db/pool.js')).pool,
      voiceRedis: (await import('../../apps/gateway/src/services/voice/redis.client.js')).voiceRedis,
      logger: (await import('../../apps/gateway/src/services/logger.js')).logger,
      session: await import('../../apps/gateway/src/services/realtime/realtime.session.js'),
      tools: await import('../../apps/gateway/src/services/realtime/realtime.tools.js'),
      audit: await import('../../apps/gateway/src/services/ai-governance/execution-audit.js'),
      policyCache: await import('../../apps/gateway/src/services/ai-governance/ai-policy-cache.js'),
    }
  : (null as never);

describe.skipIf(!run)('F8: tool arguments never leave the live tool path unredacted (real PostgreSQL + real Redis)', () => {
  const { pool } = mods ?? ({} as never);
  const q = (sql: string, params: unknown[] = []) => pool.query(sql, params);
  const captured: string[] = [];
  const spies: Array<ReturnType<typeof vi.spyOn>> = [];
  let tenant: string;
  let sessionId: string;
  let fakeSession: Record<string, unknown>;
  const sent: unknown[] = [];

  beforeAll(async () => {
    const user = await q(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [`redact-${randomUUID()}@test.local`]);
    const t = await q(`INSERT INTO public.voice_tenants (owner_user_id, company_name, phone_number, transfer_phone_number) VALUES ($1,'Redaction test',$2,'+15550001111') RETURNING id`, [user.rows[0].id, `+1555${Math.floor(Math.random() * 1e7)}`]);
    tenant = t.rows[0].id;
    await q(`INSERT INTO public.ai_agent_configs (tenant_id, disabled_tools) VALUES ($1, '["send_sms"]'::jsonb)`, [tenant]);
    mods.policyCache.invalidateTenantPolicy(tenant);
    sessionId = `sess-${randomUUID()}`;
    fakeSession = {
      id: sessionId, tenantId: tenant, callSid: `CA${randomUUID().slice(0, 8)}`, streamSid: 'MZ1', isActive: true,
      startTime: new Date(), lastActivity: new Date(), config: { tenantId: tenant, agentId: 'agent-under-test', language: 'en', tools: [] },
      openAiWs: { readyState: 1, send: (m: string) => sent.push(m) }, twilioWs: null,
    };
    const capture = (...a: unknown[]) => { captured.push(JSON.stringify(a)); };
    for (const level of ['info', 'warn', 'error', 'debug'] as const) spies.push(vi.spyOn(mods.logger, level).mockImplementation(capture as never));
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) spies.push(vi.spyOn(console, level).mockImplementation(capture as never));
  });

  afterAll(async () => {
    spies.forEach((s) => s.mockRestore());
    await mods.voiceRedis.del(`calliq:ai_audit:${tenant}:${sessionId}`).catch(() => {});
    await q(`DELETE FROM public.voice_tenants WHERE id = $1`, [tenant]);
    await pool.end();
    mods.voiceRedis.disconnect?.();
  });

  const fire = async (name: string, args: Record<string, unknown>) => {
    const manager = new mods.session.RealtimeSessionManager();
    (manager as never as { handleFunctionCall: Function }).handleFunctionCall(fakeSession, { name, call_id: `call_${name}`, arguments: JSON.stringify(args) });
    await new Promise((r) => setTimeout(r, 600)); // the call is asynchronous and fire-and-forget by design
  };

  it('runs the sensitive calls through the live path', async () => {
    await fire('create_lead', { name: SENSITIVE.name, phone: SENSITIVE.phone, email: SENSITIVE.email, address: SENSITIVE.address, interest: SENSITIVE.medical });
    await fire('transfer_call', { reason: `patient says: ${SENSITIVE.medical}`, department: 'Oncology for Jane Patient' });
    await fire('search_knowledge_base', { query: `${SENSITIVE.medical} for ${SENSITIVE.name}` });
    await fire('send_sms', { to: SENSITIVE.phone, message: `Hi ${SENSITIVE.name}, about your ${SENSITIVE.medical}` }); // denied by the sandbox governance
    await fire('collect_payment', { card_number: SENSITIVE.card, api_key: SENSITIVE.secret, notes: SENSITIVE.medical }); // unknown tool
    await fire('end_call', { reason: SENSITIVE.medical });
    expect(captured.length).toBeGreaterThan(10); // the tool path really logged
    const failed = captured.filter((c) => c.includes('AI_AUDIT_PERSIST_FAILED')).map((c) => c.slice(0, 300));
    expect(failed, 'audit persistence failed').toEqual([]);
    expect(captured.filter((c) => c.includes('AI_EXECUTION_AUDIT')).length).toBeGreaterThanOrEqual(5);
  }, 30_000);

  it('the lead really was written by the real tool (so this exercised real code, not a stub)', async () => {
    const row = await q(`SELECT 1 FROM public.leads WHERE tenant_id=$1`, [tenant]);
    expect(row.rows.length).toBeGreaterThan(0);
  });

  it('REALTIME TOOL LOGGING: no logger or console call contains a sensitive value', () => {
    const blob = captured.join('\n');
    for (const f of FORBIDDEN) expect(blob, `leaked into logs: ${f}`).not.toContain(f);
    expect(blob).toContain('REALTIME_TOOL_EXECUTE_START'); // the start line is still logged...
    expect(blob).toContain('redactedArguments'); // ...with the redacted structure
    expect(blob).toContain('[REDACTED_PHONE]');
    expect(blob).toContain('[REDACTED_NAME]');
  });

  it('REDIS AUDIT: the real Redis audit list contains no sensitive value and still carries the metadata', async () => {
    const entries = await mods.voiceRedis.lrange(`calliq:ai_audit:${tenant}:${sessionId}`, 0, 99);
    expect(entries.length).toBeGreaterThanOrEqual(5);
    const blob = entries.join('\n');
    for (const f of FORBIDDEN) expect(blob, `leaked into Redis audit: ${f}`).not.toContain(f);
    expect(blob).not.toContain('"arguments"');

    const rows = entries.map((e) => JSON.parse(e));
    const tools = rows.map((r) => r.toolName);
    expect(tools).toEqual(expect.arrayContaining(['create_lead', 'transfer_call', 'send_sms', 'collect_payment']));
    for (const r of rows) {
      expect(r).toMatchObject({ tenantId: tenant, agentId: 'agent-under-test', sessionId });
      expect(r.auditId).toMatch(/^[0-9a-f-]{36}$/);
      expect(r.occurredAt).toBeTruthy();
      expect(r.authorization === 'allow' || r.authorization === 'deny').toBe(true);
      expect(r.argumentSummary.fieldCount).toBeGreaterThan(0);
      expect(r.redactedArguments).toBeTruthy();
    }
    const lead = rows.find((r) => r.toolName === 'create_lead');
    expect(lead.outcome).toBe('success');
    expect(typeof lead.latencyMs).toBe('number');
    expect(lead.redactedArguments).toMatchObject({ name: '[REDACTED_NAME]', phone: '[REDACTED_PHONE]', email: '[REDACTED_EMAIL]', address: '[REDACTED_ADDRESS]' });
    const sms = rows.find((r) => r.toolName === 'send_sms');
    expect(sms).toMatchObject({ authorization: 'deny', outcome: 'skipped', denialReason: 'Tool send_sms disabled by policy' });
    expect(rows.find((r) => r.toolName === 'collect_payment')).toMatchObject({ authorization: 'deny' });
  });

  it('the audit API returns the same redacted view', async () => {
    const rows = await mods.audit.listSessionAudit(tenant, sessionId);
    expect(rows.length).toBeGreaterThanOrEqual(5);
    for (const f of FORBIDDEN) expect(JSON.stringify(rows), f).not.toContain(f);
  });

  it('what is sent back to the model contains no sensitive value from the error path', () => {
    const toModel = sent.map(String).join('\n');
    expect(toModel).toContain('function_call_output');
    expect(toModel).not.toContain('Jane');
    expect(toModel).not.toContain('jane.patient');
    expect(toModel).not.toContain('4111 1111');
  });
});
