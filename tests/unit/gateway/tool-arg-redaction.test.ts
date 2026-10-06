/**
 * F8: tool arguments must never reach logs, the Redis audit list, the in-memory audit buffer, platform events or
 * error text — while the audit record stays useful (tenant, agent, tool, execution id, timestamp, outcome,
 * duration, the shape of the arguments).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const redisWrites: Array<{ key: string; value: string }> = [];
vi.mock('../../../apps/gateway/src/services/voice/redis.client.js', () => ({
  voiceRedis: {
    lpush: vi.fn(async (key: string, value: string) => { redisWrites.push({ key, value }); return 1; }),
    ltrim: vi.fn(async () => 'OK'), expire: vi.fn(async () => 1), lrange: vi.fn(async () => redisWrites.map((w) => w.value)),
  },
}));
const logged: unknown[][] = [];
vi.mock('../../../apps/gateway/src/services/logger.js', () => ({
  logger: {
    info: (...a: unknown[]) => logged.push(a), warn: (...a: unknown[]) => logged.push(a),
    error: (...a: unknown[]) => logged.push(a), debug: (...a: unknown[]) => logged.push(a),
  },
}));

import {
  redactToolArguments, summarizeToolArguments, scrubFreeText, safeErrorForLog, safeResultSummary, REDACTED,
} from '../../../apps/gateway/src/security/tool-arg-redaction.js';
import { persistExecutionAudit, listSessionAudit, listRecentAuditBuffer } from '../../../apps/gateway/src/services/ai-governance/execution-audit.js';

/** Every value below is sensitive and must be absent from everything the system records. */
const SENSITIVE = {
  name: 'Jane Q. Patient',
  phone: '+971501234567',
  email: 'jane.patient@example.com',
  address: '12 Palm Street, Dubai Marina',
  notes: 'She has chest pain, type 2 diabetes and takes metformin 500mg',
  freeText: 'I was diagnosed with cancer last month and want a second opinion',
  card: '4111 1111 1111 1111',
  cardCvv: '737',
  secret: 'sk_live_abcdef1234567890ABCDEF',
  bearer: 'Bearer abcdefghijklmnop12345678',
  supplierCredential: 'supplier-portal-P@ssw0rd!',
  iban: 'AE070331234567890123456',
};
const FORBIDDEN = [
  'Jane', 'Patient', '501234567', 'jane.patient', 'example.com', 'Palm Street', 'Dubai Marina', 'chest pain', 'diabetes',
  'metformin', 'cancer', 'second opinion', '4111 1111', 'sk_live', 'abcdefghijklmnop', 'P@ssw0rd', 'AE0703312',
];

const args = () => ({
  name: SENSITIVE.name, customer_name: SENSITIVE.name, phone: SENSITIVE.phone, email: SENSITIVE.email,
  address: SENSITIVE.address, notes: SENSITIVE.notes, interest: SENSITIVE.freeText, reason: SENSITIVE.freeText,
  query: SENSITIVE.freeText, card_number: SENSITIVE.card, cvv: SENSITIVE.cardCvv, api_key: SENSITIVE.secret,
  authorization: SENSITIVE.bearer, supplier_password: SENSITIVE.supplierCredential, iban: SENSITIVE.iban,
  preferred_time: '2026-11-05T10:30:00.000Z', quantity: 3, confirmed: true, tags: ['diabetes', 'metformin'],
  nested: { contact: { phone: SENSITIVE.phone, comment: SENSITIVE.notes } },
});

const expectNoSensitive = (blob: string) => {
  for (const f of FORBIDDEN) expect(blob, `leaked: ${f}`).not.toContain(f);
};

describe('redactToolArguments', () => {
  it('removes every sensitive value but keeps the structure', () => {
    const out = redactToolArguments('create_lead', args());
    const blob = JSON.stringify(out);
    expectNoSensitive(blob);
    expect(Object.keys(out).sort()).toEqual(Object.keys(args()).sort()); // same fields, so the audit still shows what was supplied
    expect(out.confirmed).toBe(true); // booleans are not sensitive
    expect(out.preferred_time).toBe(REDACTED.datetime);
    expect(out.quantity).toBe(REDACTED.number);
    expect((out.nested as Record<string, Record<string, string>>).contact.phone).toBe(REDACTED.phone);
  });

  it('uses the specific marker for each kind of data', () => {
    const out = redactToolArguments('x', args());
    expect(out.name).toBe(REDACTED.name);
    expect(out.customer_name).toBe(REDACTED.name);
    expect(out.phone).toBe(REDACTED.phone);
    expect(out.email).toBe(REDACTED.email);
    expect(out.address).toBe(REDACTED.address);
    expect(out.notes).toBe(REDACTED.text);
    expect(out.interest).toBe(REDACTED.text);
    expect(out.query).toBe(REDACTED.text);
    expect(out.card_number).toBe(REDACTED.payment);
    expect(out.iban).toBe(REDACTED.payment);
    expect(out.api_key).toBe(REDACTED.secret);
    expect(out.authorization).toBe(REDACTED.secret);
    expect(out.supplier_password).toBe(REDACTED.secret);
  });

  it('catches sensitive data by CONTENT even under an innocent field name', () => {
    const out = redactToolArguments('x', {
      comment: 'call me on +44 7700 900123', remark: 'mail jane.patient@example.com', memo: 'card 4111 1111 1111 1111',
      misc: 'token sk_live_abcdef1234567890ABCDEF', details: 'only words here',
    });
    expect(out.comment).toBe(REDACTED.phone);
    expect(out.remark).toBe(REDACTED.email);
    expect(out.memo).toBe(REDACTED.payment);
    expect(out.misc).toBe(REDACTED.secret);
    expect(out.details).toBe(REDACTED.text); // deny by default: plain words are free text
  });

  it('keeps a platform reason code but redacts a free-text reason', () => {
    expect(redactToolArguments('transfer_call', { reason: 'emergency' }).reason).toBe('emergency');
    expect(redactToolArguments('transfer_call', { reason: 'payment_dispute' }).reason).toBe('payment_dispute');
    expect(redactToolArguments('transfer_call', { reason: 'patient says they have cancer' }).reason).toBe(REDACTED.text);
  });

  it('is irreversible: constant markers, no hashing, no masking, no length or prefix of the value', () => {
    const a = JSON.stringify(redactToolArguments('x', { phone: '+971501234567', notes: 'aaa' }));
    const b = JSON.stringify(redactToolArguments('x', { phone: '+442071234567', notes: 'a much longer note about something else entirely' }));
    expect(a).toBe(b); // different inputs, identical output
  });

  it('is safe on hostile input: deep nesting, huge arrays, odd types, non-objects', () => {
    let deep: Record<string, unknown> = { secret: 'x' };
    for (let i = 0; i < 50; i++) deep = { level: deep };
    expect(() => redactToolArguments('x', deep)).not.toThrow();
    expect(JSON.stringify(redactToolArguments('x', deep))).not.toContain('"x"');
    expect(JSON.stringify(redactToolArguments('x', { list: new Array(500).fill('Jane') }))).not.toContain('Jane');
    expect(redactToolArguments('x', 'Jane Patient')).toEqual({ _value: REDACTED.text });
    expect(redactToolArguments('x', null)).toEqual({ _value: null });
    expect(redactToolArguments('x', ['Jane'])).toEqual({ _value: ['[REDACTED_TEXT]'] });
    const circular: Record<string, unknown> = { name: 'Jane' };
    circular.self = circular;
    expect(() => redactToolArguments('x', circular)).not.toThrow();
  });

  it('summarises operational metadata without any value', () => {
    const s = summarizeToolArguments(args());
    expect(s.fieldCount).toBe(Object.keys(args()).length);
    expect(s.fields).toContain('phone');
    expect(s.redactedFieldCount).toBeGreaterThan(10);
    expectNoSensitive(JSON.stringify(s));
  });
});

describe('free text, errors and result summaries', () => {
  it('scrubs contact details, secrets, card numbers and quoted/parenthesised values from error text', () => {
    const pg = 'duplicate key value violates unique constraint "leads_phone_key" Key (phone)=(+971501234567) already exists; invalid input syntax for type uuid: "Jane Q. Patient"';
    const out = scrubFreeText(`${pg} mail jane.patient@example.com card 4111 1111 1111 1111 sk_live_abcdef1234567890ABCDEF`, 1000);
    expectNoSensitive(out);
    expect(out).toContain('duplicate key value violates unique constraint'); // the diagnosis stays useful
  });

  it('scrubs phone numbers written in prose, in every common format (not only inside a Postgres "(col)=(value)" pattern)', () => {
    // Found by the F8 mutation check: removing the free-text phone scrub used to leave every test green.
    const out = scrubFreeText('Could not reach +971501234567, tried +971 50 123 4567 and then 050-123-4567 without success', 1000);
    for (const digits of ['501234567', '50 123 4567', '123-4567']) expect(out).not.toContain(digits);
    expect(out.match(/\[REDACTED_PHONE\]/g)?.length).toBe(3);
    expect(out).toContain('Could not reach'); // the rest of the message stays readable
  });

  it('safeErrorForLog keeps the class and code, never row values', () => {
    const err = Object.assign(new Error('Key (email)=(jane.patient@example.com) is duplicated'), { code: '23505', detail: 'Key (email)=(jane.patient@example.com)' });
    const out = safeErrorForLog(err);
    expect(out.errorCode).toBe('23505');
    expect(JSON.stringify(out)).not.toContain('jane.patient');
    expect(JSON.stringify(out)).not.toContain('detail');
  });

  it('safeResultSummary keeps only fixed platform wording; any other text becomes a marker', () => {
    expect(safeResultSummary(undefined)).toBeUndefined();
    expect(safeResultSummary('Information saved.')).toBe('Information saved.');
    expect(safeResultSummary('Tool send_sms disabled by policy')).toBe('Tool send_sms disabled by policy');
    expect(safeResultSummary('Max tool executions per call exceeded')).toBe('Max tool executions per call exceeded');
    // A sentence that echoes a name cannot be recognised by pattern, so it is not kept at all.
    expect(safeResultSummary(`Saved lead for ${SENSITIVE.name} on ${SENSITIVE.phone}`)).toBe(REDACTED.text);
    expect(safeResultSummary(`Information saved for ${SENSITIVE.name}.`)).toBe(REDACTED.text);
  });

  it('a failure message keeps only its generic prefix, never the detail after the colon', () => {
    const out = safeResultSummary(`Failed to save lead: duplicate key Key (name)=(${SENSITIVE.name}) phone ${SENSITIVE.phone}`);
    expect(out).toBe('Failed to save lead');
    expectNoSensitive(String(out));
  });
});

describe('Redis execution audit persistence', () => {
  beforeEach(() => { redisWrites.length = 0; logged.length = 0; });

  const persist = () => persistExecutionAudit({
    tenantId: 'tenant-1', agentId: 'agent-9', sessionId: 'sess-1', callSid: 'CA1', eventId: 'req-1', toolName: 'create_lead',
    arguments: args(), authorization: 'allow', riskLevel: 'low', policyVersion: 'p3-v1', latencyMs: 42, outcome: 'success',
    resultSummary: `Saved lead for ${SENSITIVE.name} on ${SENSITIVE.phone}`,
  });

  it('what is written to Redis contains no sensitive value', async () => {
    await persist();
    expect(redisWrites).toHaveLength(1);
    expectNoSensitive(redisWrites[0].value);
    expect(redisWrites[0].value).not.toContain('"arguments"'); // the raw field is not even present
  });

  it('what is written to the in-memory buffer and to the logs contains no sensitive value', async () => {
    await persist();
    expectNoSensitive(JSON.stringify(listRecentAuditBuffer('tenant-1')));
    expectNoSensitive(JSON.stringify(logged));
  });

  it('the redacted record still carries the operational metadata', async () => {
    const rec = await persist();
    expect(rec).toMatchObject({ tenantId: 'tenant-1', agentId: 'agent-9', sessionId: 'sess-1', callSid: 'CA1', toolName: 'create_lead', authorization: 'allow', outcome: 'success', latencyMs: 42, riskLevel: 'low', policyVersion: 'p3-v1', eventId: 'req-1' });
    expect(rec.auditId).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(rec.occurredAt).getTime()).toBeGreaterThan(0);
    expect(rec.argumentSummary.fieldCount).toBeGreaterThan(10);
    expect(rec.argumentSummary.fields).toEqual(expect.arrayContaining(['name', 'phone', 'email', 'notes']));
    expect(rec.redactedArguments.phone).toBe(REDACTED.phone);
    const stored = JSON.parse(redisWrites[0].value);
    expect(stored.redactedArguments.name).toBe(REDACTED.name);
    expect(stored.argumentSummary.redactedFieldCount).toBeGreaterThan(10);
  });

  it('a denial reason is reduced to platform wording too', async () => {
    const rec = await persistExecutionAudit({
      tenantId: 't', sessionId: 's', callSid: 'c', toolName: 'send_sms', arguments: { to: SENSITIVE.phone }, authorization: 'deny',
      denialReason: `blocked for ${SENSITIVE.email}`, riskLevel: 'high', policyVersion: 'p3-v1', outcome: 'skipped',
    });
    expectNoSensitive(JSON.stringify(rec));
    expect(rec.redactedArguments.to).toBe(REDACTED.phone);
    expect(rec.denialReason).toBe(REDACTED.text);
    const known = await persistExecutionAudit({
      tenantId: 't', sessionId: 's', callSid: 'c', toolName: 'send_sms', arguments: {}, authorization: 'deny',
      denialReason: 'Tool send_sms disabled by policy', riskLevel: 'high', policyVersion: 'p3-v1', outcome: 'skipped',
    });
    expect(known.denialReason).toBe('Tool send_sms disabled by policy'); // a platform reason stays useful
  });

  it('legacy audit entries already in Redis (raw arguments) are redacted when read back', async () => {
    redisWrites.push({
      key: 'calliq:ai_audit:tenant-1:sess-old',
      value: JSON.stringify({
        auditId: 'old', tenantId: 'tenant-1', sessionId: 'sess-old', callSid: 'c', toolName: 'create_lead',
        arguments: args(), authorization: 'allow', riskLevel: 'low', policyVersion: 'p3-v1', outcome: 'success',
        resultSummary: `Saved ${SENSITIVE.name} ${SENSITIVE.phone}`, occurredAt: new Date().toISOString(),
      }),
    });
    const rows = await listSessionAudit('tenant-1', 'sess-old');
    expect(rows).toHaveLength(1);
    expectNoSensitive(JSON.stringify(rows));
    expect(rows[0]).not.toHaveProperty('arguments');
    expect(rows[0].redactedArguments.phone).toBe(REDACTED.phone);
    expect(rows[0].resultSummary).toBe(REDACTED.text);
  });
});
