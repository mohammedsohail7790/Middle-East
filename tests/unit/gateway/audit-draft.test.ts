import { describe, expect, it, vi } from 'vitest';
import { draftAuditReport, formatAnswers, openAiJson, SYSTEM_PROMPT } from '../../../apps/gateway/src/services/audit/audit-draft.js';

const answers = { a_company: 'Acme Property Services, we maintain buildings.', b_process: 'Jobs are typed into the CRM, then invoicing, then a sheet.', b_volume: '300 a month', f_budget: 'AED 10k to 30k' };
const good = {
  assessment: { complexity: 'medium', volume: 'low', dataFormat: 'structured', systems: 'cloud', humanApproval: false, budgetMaxAed: 30000 },
  summary: 'Acme re-types the same job details into three tools, which costs the office hours each week and causes missed invoices.',
  findings: ['Three tools hold the same data.'],
  opportunities: [{ title: 'Capture each job once', problem: 'Typed three times.', solution: 'One entry feeds all three tools.', payoff: 'Less admin and fewer missed invoices.' }],
  phaseDeliverables: [['Map the job flow'], ['Build the connected workflow'], ['Test and hand over']],
  considerations: ['Confirm CRM admin access.'],
  nextSteps: ['Agree the scope.'],
};

describe('audit draft', () => {
  it('builds a report from the AI output, with the fee set by code', async () => {
    const llm = vi.fn().mockResolvedValue(JSON.stringify(good));
    const out = await draftAuditReport({ answers, company: 'Acme', contactName: 'Sam', llm, now: new Date('2026-11-12T00:00:00Z') });
    expect(out?.report.investment.feeAed).toBe(24000);
    expect(out?.report.date).toBe('2026-11-12');
    expect(llm.mock.calls[0][1]).toContain('A: 300 a month');
  });

  it('asks for Arabic text when the client wrote in Arabic', async () => {
    const llm = vi.fn().mockResolvedValue(JSON.stringify(good));
    await draftAuditReport({ answers: { a_company: 'شركة الأمل للمقاولات', b_process: 'نكتب البيانات يدوياً في ثلاثة أنظمة' }, company: 'الأمل', contactName: 'سالم', llm });
    expect(llm.mock.calls[0][0]).toContain('Modern Standard Arabic');
  });

  it('returns null when the AI call fails, returns junk or returns an empty shell', async () => {
    expect(await draftAuditReport({ answers, company: 'A', contactName: 'B', llm: vi.fn().mockRejectedValue(new Error('down')) })).toBeNull();
    expect(await draftAuditReport({ answers, company: 'A', contactName: 'B', llm: vi.fn().mockResolvedValue('not json') })).toBeNull();
    expect(await draftAuditReport({ answers, company: 'A', contactName: 'B', llm: vi.fn().mockResolvedValue('{}') })).toBeNull();
  });

  it('tells the AI never to write prices or hours', () => {
    expect(SYSTEM_PROMPT('en')).toMatch(/NEVER write any price/);
  });

  it('lists only answered questions, grouped by section', () => {
    const text = formatAnswers(answers);
    expect(text).toContain('## A. Business overview and goals');
    expect(text).not.toContain('Who is the ultimate project sponsor');
  });
});

describe('openAiJson', () => {
  it('fails clearly without a key and on an HTTP error, and returns the message content otherwise', async () => {
    await expect(openAiJson('s', 'u', {} as any)).rejects.toThrow(/OPENAI_API_KEY/);
    const bad = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    await expect(openAiJson('s', 'u', { OPENAI_API_KEY: 'k' } as any, bad as any)).rejects.toThrow(/429/);
    const ok = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '{"a":1}' } }] }) });
    expect(await openAiJson('s', 'u', { OPENAI_API_KEY: 'k' } as any, ok as any)).toBe('{"a":1}');
    expect(JSON.parse((ok.mock.calls[0][1] as any).body).response_format).toEqual({ type: 'json_object' });
  });
});
