/**
 * The eight external events the Klaros pilots depend on, from platform event to outbound webhook step.
 *
 * Substituted: customWebhooksService (nothing is sent anywhere; the call that WOULD be made is captured).
 * Real: the mapping, the payload shaping, the call-finalisation ordering, and the stable event ids.
 * Signatures, timestamp freshness, idempotency, retry and DLQ are covered by the existing real-HTTP / real-Redis
 * suites (klaros-webhook-delivery, klaros-ordered-delivery, klaros-e2e, klaros-event-retry-dlq); this file adds
 * the per-event contract that those do not enumerate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const dispatched: Array<{ tenantId: string; steps: Array<{ type: string; eventId: string; data: Record<string, unknown> }>; opts: unknown }> = [];

vi.mock('../../../apps/gateway/src/services/webhooks/webhooks.service.js', () => ({
  customWebhooksService: {
    dispatchKlarosSequence: vi.fn(async (tenantId: string, steps: never[], opts: unknown) => {
      dispatched.push({ tenantId, steps, opts });
    }),
  },
}));
vi.mock('../../../apps/gateway/src/services/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { handleKlarosWebhookEvent } from '../../../apps/gateway/src/events/consumers/klaros-webhook.consumer.js';
import { createPlatformEvent } from '../../../infrastructure/events/event-envelope.js';
import { PlatformEventTypes } from '../../../infrastructure/events/event-types.js';
import { KLAROS_EVENT_TYPES, assertValidKlarosEvents } from '../../../apps/gateway/src/security/klaros-event-types.js';

const TENANT = '11111111-1111-4111-8111-111111111111';

const CASES: Array<[string, string, Record<string, unknown>, string[]]> = [
  ['lead.created', PlatformEventTypes.LEAD_CREATED, { leadId: 'L1', phone: 'p', name: 'n', klarosLeadId: 'K1', internalNote: 'x' }, ['leadId', 'phone', 'name', 'callId', 'klarosLeadId']],
  ['lead.updated', PlatformEventTypes.LEAD_UPDATED, { leadId: 'L1', phone: 'p', name: 'n', klarosLeadId: 'K1', internalNote: 'x' }, ['leadId', 'phone', 'name', 'callId', 'klarosLeadId']],
  ['lead.escalated', PlatformEventTypes.LEAD_ESCALATED, { leadId: 'L1', klarosLeadId: 'K1', target: 'human', reason: 'r', transcript: 'secret' }, ['leadId', 'callId', 'klarosLeadId', 'target', 'reason']],
  ['appointment.confirmed', PlatformEventTypes.APPOINTMENT_CREATED, { appointmentId: 'A1', scheduledTime: 't', reason: 'r', leadId: 'L1', klarosLeadId: 'K1', customerEmail: 'x' }, ['appointmentId', 'scheduledTime', 'reason', 'leadId', 'klarosLeadId']],
  ['appointment.rescheduled', PlatformEventTypes.APPOINTMENT_RESCHEDULED, { appointmentId: 'A1', scheduledTime: 't', reason: 'r', leadId: 'L1', klarosLeadId: 'K1', customerEmail: 'x' }, ['appointmentId', 'scheduledTime', 'reason', 'leadId', 'klarosLeadId']],
  ['appointment.cancelled', PlatformEventTypes.APPOINTMENT_CANCELLED, { appointmentId: 'A1', scheduledTime: 't', reason: 'r', leadId: 'L1', klarosLeadId: 'K1', customerEmail: 'x' }, ['appointmentId', 'scheduledTime', 'reason', 'leadId', 'klarosLeadId']],
];

describe('Klaros event contract: platform event -> outbound webhook step', () => {
  beforeEach(() => {
    dispatched.length = 0;
  });

  it('the registered Klaros event types include all eight the pilots rely on', () => {
    for (const t of ['lead.created', 'lead.updated', 'lead.qualified', 'lead.escalated', 'call.completed', 'appointment.confirmed', 'appointment.rescheduled', 'appointment.cancelled']) {
      expect(KLAROS_EVENT_TYPES).toContain(t);
    }
    expect(() => assertValidKlarosEvents(['lead.created', 'call.completed'])).not.toThrow();
    expect(() => assertValidKlarosEvents(['lead.created', 'payment.captured'])).toThrow();
  });

  it.each(CASES)('%s: one step, correct type, whitelisted data only, tenant-scoped, stable id', async (klarosType, platformType, payload, allowed) => {
    const event = createPlatformEvent(platformType as never, payload, { tenantId: TENANT, callSid: 'CA1' });
    await handleKlarosWebhookEvent(event, { finalAttempt: false });

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].tenantId).toBe(TENANT);
    expect(dispatched[0].steps).toHaveLength(1);
    const step = dispatched[0].steps[0];
    expect(step.type).toBe(klarosType);
    expect(step.eventId).toBe(event.eventId); // same platform event => same id on every retry (the receiver's idempotency key)
    const sent = Object.keys(step.data).filter((k) => step.data[k] !== undefined);
    for (const k of sent) expect(allowed, `unexpected field ${k}`).toContain(k);
    expect(JSON.stringify(step.data)).not.toMatch(/internalNote|transcript|customerEmail/);
  });

  it('call.completed with a qualification delivers lead.qualified FIRST, then call.completed, with derived stable ids', async () => {
    const event = createPlatformEvent(
      PlatformEventTypes.CALL_ENDED as never,
      {
        callSid: 'CA9', durationMs: 1000, klarosLeadId: 'K1', qualificationStatus: 'qualified', escalation: undefined,
        qualificationEvent: { status: 'qualified', leadId: 'L1', klarosLeadId: 'K1', fields: { service: 's' }, missingFields: [], reason: 'ok', confidence: 0.9 },
        rawTranscript: 'must not leave Halla',
      },
      { tenantId: TENANT, callSid: 'CA9' }
    );
    await handleKlarosWebhookEvent(event, { finalAttempt: true });

    const steps = dispatched[0].steps;
    expect(steps.map((s) => s.type)).toEqual(['lead.qualified', 'call.completed']);
    expect(steps[0].eventId).toBe(`${event.eventId}:lead.qualified`);
    expect(steps[1].eventId).toBe(event.eventId);
    expect(dispatched[0].opts).toEqual({ finalAttempt: true });
    expect(JSON.stringify(steps)).not.toContain('rawTranscript');
  });

  it.each(['qualified', 'not_qualified', 'needs_human_review'])(
    'lead.qualified carries the outcome %s under BOTH `status` and `qualification` (the Klaros receiver reads `qualification`, so a non-qualified outcome is never defaulted to "qualified")',
    async (status) => {
      const event = createPlatformEvent(
        PlatformEventTypes.CALL_ENDED as never,
        { callSid: 'CA7', klarosLeadId: 'K1', qualificationStatus: status, qualificationEvent: { status, leadId: 'L1', klarosLeadId: 'K1', fields: {}, missingFields: [], reason: 'r', confidence: 0.5 } },
        { tenantId: TENANT, callSid: 'CA7' }
      );
      await handleKlarosWebhookEvent(event);
      const [qualified, completed] = dispatched[0].steps;
      expect(qualified.data.status).toBe(status);
      expect(qualified.data.qualification).toBe(status);
      expect(completed.data.qualificationStatus).toBe(status); // call.completed already used a key the receiver reads
    }
  );

  it('an unknown/degraded qualification yields only call.completed (never a made-up lead.qualified)', async () => {
    const event = createPlatformEvent(
      PlatformEventTypes.CALL_ENDED as never,
      { callSid: 'CA8', qualificationEvent: { status: 'unknown' } },
      { tenantId: TENANT, callSid: 'CA8' }
    );
    await handleKlarosWebhookEvent(event);
    expect(dispatched[0].steps.map((s) => s.type)).toEqual(['call.completed']);
  });

  it('an internal event with no external contract name sends nothing', async () => {
    const event = createPlatformEvent(PlatformEventTypes.CALL_CONNECTED as never, {}, { tenantId: TENANT });
    await handleKlarosWebhookEvent(event);
    expect(dispatched).toHaveLength(0);
  });

  it('a delivery failure is rethrown so the event bus retries it (not swallowed)', async () => {
    const { customWebhooksService } = await import('../../../apps/gateway/src/services/webhooks/webhooks.service.js');
    (customWebhooksService.dispatchKlarosSequence as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Webhook w responded 429'));
    const event = createPlatformEvent(PlatformEventTypes.LEAD_CREATED as never, { leadId: 'L1' }, { tenantId: TENANT });
    await expect(handleKlarosWebhookEvent(event)).rejects.toThrow('responded 429');
  });
});
