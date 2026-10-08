/**
 * REAL PostgreSQL test of the pilot workforce templates: provisioning onto sandbox tenants through the real
 * services, tenant isolation, and the live tool-governance path (executeMediatedTool) reading the governance
 * columns the provisioning wrote.
 *
 * Runs only when HALLA_TEST_DATABASE_URL points at a disposable Postgres that already has supabase/schema.sql +
 * migrations applied (same contract as klaros-postgres.integration.test.ts). Nothing is mocked at the database layer.
 *
 * Still substituted: Redis (voiceRedis), Twilio, and the tracing/metrics side modules are real but inert.
 * No call is placed, no SMS is sent, no lead is created, no customer is contacted.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';

const DATABASE_URL = process.env.HALLA_TEST_DATABASE_URL;
if (DATABASE_URL) {
  process.env.GATEWAY_DATABASE_URL = DATABASE_URL;
  process.env.PGSSLMODE = 'disable';
}

vi.mock('twilio', () => ({ default: () => ({ calls: { create: vi.fn(async () => ({ sid: 'CA_NEVER' })) } }) }));
vi.mock('../../apps/gateway/src/services/voice/redis.client.js', () => ({
  voiceRedis: {
    get: vi.fn(async () => null), set: vi.fn(async () => 'OK'), setex: vi.fn(async () => 'OK'), del: vi.fn(async () => 1),
    expire: vi.fn(async () => 1), hset: vi.fn(async () => 1), ping: vi.fn(async () => 'PONG'), publish: vi.fn(async () => 1),
  },
}));
vi.mock('../../apps/gateway/src/services/auth/jwt-tenant-verifier.js', () => ({ verifyUserBearerToken: vi.fn() }));
vi.mock('../../apps/gateway/src/services/auth/internal-service-auth.js', () => ({ verifyInternalServiceRequest: vi.fn() }));
vi.mock('../../apps/gateway/src/security/sse-token.js', () => ({ verifySseDashboardToken: vi.fn(() => null) }));

const mods = DATABASE_URL
  ? {
      pool: (await import('../../apps/gateway/src/services/db/pool.js')).pool,
      aiConfig: (await import('../../apps/gateway/src/services/ai-config/ai-config.service.js')).aiConfigService,
      ivr: (await import('../../apps/gateway/src/services/ivr/ivr.service.js')).ivrService,
      klaros: await import('../../apps/gateway/src/services/klaros/klaros.controller.js'),
      wf: await import('../../apps/gateway/src/services/workforce-templates/index.js'),
      provision: await import('../../apps/gateway/src/services/workforce-templates/provision.js'),
      governance: (await import('../../apps/gateway/src/services/ai-governance/ai-governance.service.js')).AiGovernanceService,
      policyCache: await import('../../apps/gateway/src/services/ai-governance/ai-policy-cache.js'),
    }
  : (null as never);

const run = Boolean(DATABASE_URL);

describe.skipIf(!run)('Pilot workforce templates against REAL PostgreSQL', () => {
  const { pool } = mods ?? ({} as never);
  const q = (sql: string, params: unknown[] = []) => pool.query(sql, params);
  let medical: string;
  let shop: string;
  let bystander: string; // sandbox-allowed, never provisioned: must see nothing
  let outsider: string; // NOT in the sandbox allow-list
  let noTransfer: string; // in the allow-list but has no transfer number
  let essential: string; // in the allow-list but on a one-agent plan

  async function seedTenant(label: string): Promise<string> {
    const user = await q(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [`${label}-${randomUUID()}@test.local`]);
    const tenant = await q(
      `INSERT INTO public.voice_tenants (owner_user_id, company_name, phone_number, transfer_phone_number) VALUES ($1, $2, $3, '+15550001111') RETURNING id`,
      [user.rows[0].id, `Workforce PG test ${label}`, `+1555${Math.floor(Math.random() * 1e7)}`]
    );
    const id = tenant.rows[0].id as string;
    await q(
      `INSERT INTO public.subscriptions (tenant_id, plan, status, currency, current_period_start, current_period_end)
       VALUES ($1, 'professional', 'active', 'usd', NOW(), NOW() + INTERVAL '30 days')`,
      [id]
    );
    return id;
  }

  beforeAll(async () => {
    medical = await seedTenant('medical');
    shop = await seedTenant('shop');
    bystander = await seedTenant('bystander');
    outsider = await seedTenant('outsider');
    noTransfer = await seedTenant('no-transfer');
    await q(`UPDATE public.voice_tenants SET transfer_phone_number = NULL WHERE id = $1`, [noTransfer]);
    essential = await seedTenant('essential');
    await q(`UPDATE public.subscriptions SET plan = 'essential' WHERE tenant_id = $1`, [essential]);
    process.env.HALLA_ENVIRONMENT = 'test';
    process.env.HALLA_WORKFORCE_SANDBOX_TENANT_IDS = [medical, shop, bystander, noTransfer, essential].join(',');
    // Business-owned data that a template must never overwrite.
    await mods.aiConfig.upsertConfig(medical, { businessDescription: 'Owned by the business', servicesOffered: ['Business-supplied service'] });
  });

  afterAll(async () => {
    delete process.env.HALLA_WORKFORCE_SANDBOX_TENANT_IDS;
    delete process.env.HALLA_ENVIRONMENT;
    await q(`DELETE FROM public.voice_tenants WHERE id = ANY($1::uuid[])`, [[medical, shop, bystander, outsider, noTransfer, essential]]);
    await pool.end();
  });

  describe('provisioning guard', () => {
    it('refuses a tenant that is not in the sandbox allow-list and writes nothing', async () => {
      await expect(mods.provision.applyWorkforceTemplate(outsider, mods.wf.medicalTourismTemplate)).rejects.toThrow(/not in HALLA_WORKFORCE_SANDBOX_TENANT_IDS/);
      expect((await q(`SELECT 1 FROM public.ai_agents WHERE tenant_id=$1`, [outsider])).rows).toHaveLength(0);
      expect((await q(`SELECT 1 FROM public.ai_agent_configs WHERE tenant_id=$1`, [outsider])).rows).toHaveLength(0);
    });

    it('refuses everything when the allow-list is empty (the default)', async () => {
      const saved = process.env.HALLA_WORKFORCE_SANDBOX_TENANT_IDS;
      process.env.HALLA_WORKFORCE_SANDBOX_TENANT_IDS = '';
      await expect(mods.provision.applyWorkforceTemplate(medical, mods.wf.medicalTourismTemplate)).rejects.toThrow(/sandbox tenants only/);
      process.env.HALLA_WORKFORCE_SANDBOX_TENANT_IDS = saved;
    });

    it.each([undefined, '', 'production', 'prod', 'live', 'Production '])('refuses when HALLA_ENVIRONMENT is %j (fail-safe: only an explicit sandbox value is accepted)', async (value) => {
      const saved = process.env.HALLA_ENVIRONMENT;
      if (value === undefined) delete process.env.HALLA_ENVIRONMENT;
      else process.env.HALLA_ENVIRONMENT = value;
      try {
        await expect(mods.provision.applyWorkforceTemplate(medical, mods.wf.medicalTourismTemplate, { dryRun: true })).rejects.toThrow(/HALLA_ENVIRONMENT must be explicitly/);
        await expect(mods.provision.applyWorkforceTemplate(medical, mods.wf.medicalTourismTemplate)).rejects.toThrow(/HALLA_ENVIRONMENT must be explicitly/);
      } finally {
        process.env.HALLA_ENVIRONMENT = saved;
      }
      expect((await q(`SELECT 1 FROM public.ai_agents WHERE tenant_id=$1`, [medical])).rows).toHaveLength(0);
    });

    it.each(['staging', 'development', 'test', ' STAGING '])('accepts the sandbox environment %j', async (value) => {
      const saved = process.env.HALLA_ENVIRONMENT;
      process.env.HALLA_ENVIRONMENT = value;
      try {
        const r = await mods.provision.applyWorkforceTemplate(medical, mods.wf.medicalTourismTemplate, { dryRun: true });
        expect(r.dryRun).toBe(true);
      } finally {
        process.env.HALLA_ENVIRONMENT = saved;
      }
    });

    it('requires a transfer number and writes NOTHING without one', async () => {
      await expect(mods.provision.applyWorkforceTemplate(noTransfer, mods.wf.medicalTourismTemplate)).rejects.toThrow(/no valid E\.164 transfer number/);
      expect((await q(`SELECT 1 FROM public.ai_agents WHERE tenant_id=$1`, [noTransfer])).rows).toHaveLength(0);
      expect((await q(`SELECT 1 FROM public.ai_agent_configs WHERE tenant_id=$1`, [noTransfer])).rows).toHaveLength(0);
      await q(`UPDATE public.voice_tenants SET transfer_phone_number = 'not-a-number' WHERE id = $1`, [noTransfer]);
      await expect(mods.provision.applyWorkforceTemplate(noTransfer, mods.wf.medicalTourismTemplate, { dryRun: true })).rejects.toThrow(/E\.164/);
    });

    it('requires a plan that allows three agents, and refuses BEFORE any write (never half-provisioned)', async () => {
      await expect(mods.provision.applyWorkforceTemplate(essential, mods.wf.dropshippingTemplate)).rejects.toThrow(/plan allows 1 active agent\(s\) but this workforce needs 3/);
      expect((await q(`SELECT 1 FROM public.ai_agents WHERE tenant_id=$1`, [essential])).rows).toHaveLength(0);
      expect((await q(`SELECT 1 FROM public.ai_agent_configs WHERE tenant_id=$1`, [essential])).rows).toHaveLength(0);
    });

    it('warns that business knowledge is external and the knowledge base is empty (the template supplies none)', async () => {
      const r = await mods.provision.applyWorkforceTemplate(medical, mods.wf.medicalTourismTemplate, { dryRun: true });
      expect(r.warnings.join(' ')).toMatch(/knowledge base is empty/);
    });

    it('no synthetic business fact enters the tenant: provisioning leaves services, areas and the knowledge base untouched', async () => {
      await mods.provision.applyWorkforceTemplate(bystander, mods.wf.dropshippingTemplate);
      const cfg = await q(`SELECT services_offered, service_areas, business_description FROM public.ai_agent_configs WHERE tenant_id=$1`, [bystander]);
      expect(cfg.rows[0].services_offered).toEqual([]);
      expect(cfg.rows[0].service_areas).toEqual([]);
      expect(cfg.rows[0].business_description ?? '').toBe('');
      expect((await q(`SELECT 1 FROM public.knowledge_base WHERE tenant_id=$1`, [bystander])).rows).toHaveLength(0);
      const agents = await q(`SELECT services FROM public.ai_agents WHERE tenant_id=$1`, [bystander]);
      for (const a of agents.rows) expect(a.services).toEqual([]);
      await q(`DELETE FROM public.ai_agents WHERE tenant_id=$1`, [bystander]);
      await q(`DELETE FROM public.ai_agent_configs WHERE tenant_id=$1`, [bystander]);
    });

    it('refuses an invalid template', async () => {
      const bad = JSON.parse(JSON.stringify(mods.wf.medicalTourismTemplate));
      bad.agents[0].systemPrompt += ' see https://example.org';
      await expect(mods.provision.applyWorkforceTemplate(medical, bad)).rejects.toThrow(/invalid template/);
    });

    it('a dry run reports what it would do and changes nothing', async () => {
      const r = await mods.provision.applyWorkforceTemplate(medical, mods.wf.medicalTourismTemplate, { dryRun: true });
      expect(r.agents.map((a: { action: string }) => a.action)).toEqual(['would_create', 'would_create', 'would_create']);
      expect((await q(`SELECT 1 FROM public.ai_agents WHERE tenant_id=$1`, [medical])).rows).toHaveLength(0);
    });
  });

  describe('Medical Tourism provisioned on one sandbox tenant', () => {
    it('creates the three agents with the specified names and prompts, preserving business-owned data', async () => {
      const r = await mods.provision.applyWorkforceTemplate(medical, mods.wf.medicalTourismTemplate);
      expect(r.agents.map((a: { name: string }) => a.name)).toEqual(['Receptionist / Intake', 'Qualification', 'Follow-up / Coordination']);
      expect(r.agents.every((a: { action: string }) => a.action === 'created')).toBe(true);

      const rows = await q(`SELECT name, role, system_prompt, services, active, tone FROM public.ai_agents WHERE tenant_id=$1 ORDER BY name`, [medical]);
      expect(rows.rows).toHaveLength(3);
      for (const row of rows.rows) {
        const t = mods.wf.medicalTourismTemplate.agents.find((a: { name: string }) => a.name === row.name)!;
        expect(row.system_prompt).toBe(t.systemPrompt);
        expect(row.role).toBe(t.role);
        expect(row.services).toEqual([]);
        expect(row.active).toBe(true);
      }
      const cfg = await mods.aiConfig.getConfig(medical);
      expect(cfg.systemInstructions).toBe(mods.wf.medicalTourismTemplate.tenantConfig.systemInstructions);
      expect(cfg.businessDescription).toBe('Owned by the business'); // never overwritten
      expect(cfg.servicesOffered).toEqual(['Business-supplied service']);
      expect(cfg.transferConditions.enforcement).toBe('prompt_instruction');
      expect(cfg.requiredFields).toEqual(['name', 'phone', 'service']);
    });

    it('writes the sandbox governance columns', async () => {
      const raw = await q(
        `SELECT safety_mode, risk_tolerance, ai_governance_enabled, disabled_tools, auto_schedule_appointment, auto_send_confirmation
           FROM public.ai_agent_configs WHERE tenant_id=$1`, [medical]);
      expect(raw.rows[0]).toMatchObject({ safety_mode: 'standard', risk_tolerance: 'standard', ai_governance_enabled: true, auto_schedule_appointment: false, auto_send_confirmation: false });
      expect(raw.rows[0].disabled_tools).toEqual(expect.arrayContaining(['send_sms', 'schedule_appointment', 'create_appointment']));
    });

    it('is idempotent: a second apply updates in place and never duplicates an agent', async () => {
      const r = await mods.provision.applyWorkforceTemplate(medical, mods.wf.medicalTourismTemplate);
      expect(r.agents.every((a: { action: string }) => a.action === 'updated')).toBe(true);
      expect((await q(`SELECT 1 FROM public.ai_agents WHERE tenant_id=$1`, [medical])).rows).toHaveLength(3);
    });

    it('a Klaros PUT /workforce payload applied through the real mapping keeps the agents and the governance', async () => {
      const update = mods.klaros.fromKlarosWorkforceInput(mods.wf.toKlarosWorkforcePayload(mods.wf.medicalTourismTemplate));
      await mods.aiConfig.upsertConfig(medical, update);
      expect((await q(`SELECT 1 FROM public.ai_agents WHERE tenant_id=$1`, [medical])).rows).toHaveLength(3);
      const raw = await q(`SELECT disabled_tools FROM public.ai_agent_configs WHERE tenant_id=$1`, [medical]);
      expect(raw.rows[0].disabled_tools).toContain('send_sms');
    });
  });

  describe('Dropshipping provisioned on a second sandbox tenant', () => {
    it('creates its own three agents', async () => {
      const r = await mods.provision.applyWorkforceTemplate(shop, mods.wf.dropshippingTemplate);
      expect(r.agents.map((a: { name: string }) => a.name)).toEqual(['Sales / Product Assistant', 'Customer Support', 'Order / Fulfillment']);
      expect((await q(`SELECT 1 FROM public.ai_agents WHERE tenant_id=$1`, [shop])).rows).toHaveLength(3);
    });
  });

  describe('tenant isolation (application-layer scoping on a real database)', () => {
    it('each tenant sees only its own agents through the service and through the Klaros discovery projection', async () => {
      const a = await mods.ivr.listAgents(medical);
      const b = await mods.ivr.listAgents(shop);
      expect(a.map((x: { name: string }) => x.name).sort()).toEqual(['Follow-up / Coordination', 'Qualification', 'Receptionist / Intake']);
      expect(b.map((x: { name: string }) => x.name).sort()).toEqual(['Customer Support', 'Order / Fulfillment', 'Sales / Product Assistant']);
      expect(new Set([...a, ...b].map((x: { id: string }) => x.id)).size).toBe(6);
      for (const agent of a) expect(agent.tenantId).toBe(medical);
      for (const agent of b) expect(agent.tenantId).toBe(shop);
      expect(JSON.stringify(b.map(mods.klaros.toKlarosAgentOutput))).not.toMatch(/Receptionist|Qualification/);
    });

    it('a tenant cannot update or delete another tenant\'s agent', async () => {
      const [target] = await mods.ivr.listAgents(medical);
      await expect(mods.ivr.updateAgent(shop, target.id, { tone: 'casual' })).rejects.toThrow(/not found/i);
      await mods.ivr.deleteAgent(shop, target.id); // scoped DELETE: matches no row
      const still = (await mods.ivr.listAgents(medical)).find((x: { id: string }) => x.id === target.id);
      expect(still?.tone).not.toBe('casual');
    });

    it('configuration is tenant-scoped: neither workforce leaks into the other tenant or into an untouched one', async () => {
      const medCfg = await mods.aiConfig.getConfig(medical);
      const shopCfg = await mods.aiConfig.getConfig(shop);
      const emptyCfg = await mods.aiConfig.getConfig(bystander);
      expect(medCfg.systemInstructions).toContain('medical tourism');
      expect(shopCfg.systemInstructions).toContain('online store');
      expect(shopCfg.systemInstructions).not.toContain('medical tourism');
      expect(emptyCfg.systemInstructions ?? '').not.toMatch(/medical tourism|online store/);
      expect(shopCfg.businessDescription).not.toBe('Owned by the business');
      expect((await mods.ivr.listAgents(bystander))).toEqual([]);
      expect((await q(`SELECT 1 FROM public.ai_agents WHERE tenant_id=$1`, [outsider])).rows).toHaveLength(0);
    });

    it('governance is tenant-scoped: an untouched tenant keeps default governance', async () => {
      const raw = await q(`SELECT 1 FROM public.ai_agent_configs WHERE tenant_id=$1 AND disabled_tools ? 'send_sms'`, [bystander]);
      expect(raw.rows).toHaveLength(0);
    });
  });

  describe('the live tool-governance path honours what was provisioned (REAL enforcement, tool level only)', () => {
    const session = (tenantId: string) => ({ id: `s-${tenantId}`, tenantId, callSid: `CA${tenantId.slice(0, 6)}` }) as never;
    const gov = () => new (mods.governance as never as new () => { executeMediatedTool: Function })();

    it('send_sms and booking tools are denied for the provisioned tenant; the executor is never run', async () => {
      mods.policyCache.invalidateTenantPolicy(medical);
      let ran = 0;
      for (const tool of ['send_sms', 'schedule_appointment', 'create_appointment']) {
        const out = await gov().executeMediatedTool(async () => { ran++; return { success: true, message: 'x' }; }, session(medical), tool, { to: '+15550000000', time: new Date(Date.now() + 3600_000).toISOString() });
        expect(out.success, tool).toBe(false);
        expect(out.message).toMatch(/disabled by policy/);
      }
      expect(ran).toBe(0);
    });

    it('transfer_call and search_knowledge_base still run (escalation by transfer stays possible)', async () => {
      mods.policyCache.invalidateTenantPolicy(medical);
      const out = await gov().executeMediatedTool(async () => ({ success: true, message: 'ran' }), session(medical), 'search_knowledge_base', { query: 'x' });
      expect(out).toMatchObject({ success: true, message: 'ran' });
      const t = await gov().executeMediatedTool(async () => ({ success: true, message: 'ran' }), session(medical), 'transfer_call', { phone: '+15551234567', reason: 'emergency' });
      expect(t).toMatchObject({ success: true, message: 'ran' });
    });

    it("documents the strict-mode hazard on real code: in 'strict' the governance layer blocks transfer_call", async () => {
      await mods.aiConfig.upsertConfig(bystander, {}); // the governance columns live on the tenant's config row, which must exist
      await q(`UPDATE public.ai_agent_configs SET safety_mode='strict' WHERE tenant_id=$1`, [bystander]);
      mods.policyCache.invalidateTenantPolicy(bystander);
      const out = await gov().executeMediatedTool(async () => ({ success: true, message: 'ran' }), session(bystander), 'transfer_call', { phone: '+15551234567', reason: 'emergency' });
      expect(out.success).toBe(false);
      expect(out.message).toMatch(/elevated approval in strict safety mode/);
      await q(`UPDATE public.ai_agent_configs SET safety_mode='standard' WHERE tenant_id=$1`, [bystander]);
    });
  });
});
