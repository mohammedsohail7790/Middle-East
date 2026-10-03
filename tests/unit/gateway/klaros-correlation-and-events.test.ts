import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../apps/gateway/src/services/voice/tenant-scope.js', () => ({
  voiceDb: { query: vi.fn() },
}));
vi.mock('../../../apps/gateway/src/services/webhooks/webhooks.service.js', () => ({
  customWebhooksService: { dispatchKlarosSequence: vi.fn(async () => undefined) },
}));

import { voiceDb } from '../../../apps/gateway/src/services/voice/tenant-scope.js';
import { customWebhooksService } from '../../../apps/gateway/src/services/webhooks/webhooks.service.js';
import {
  resolveAppointmentCorrelation,
  resolveCallCorrelation,
} from '../../../apps/gateway/src/services/klaros/correlation.js';
import { handleKlarosWebhookEvent } from '../../../apps/gateway/src/events/consumers/klaros-webhook.consumer.js';

const query = voiceDb.query as unknown as ReturnType<typeof vi.fn>;
const dispatch = customWebhooksService.dispatchKlarosSequence as unknown as ReturnType<typeof vi.fn>;
const rows = (...r: any[]) => ({ rows: r });

beforeEach(() => {
  query.mockReset();
  dispatch.mockClear();
});

describe('resolveCallCorrelation', () => {
  it('returns the Klaros id set on the call and the lead linked to it', async () => {
    query.mockResolvedValueOnce(rows({ id: 'call-uuid', klaros_lead_id: 'kl-from-call' }));
    query.mockResolvedValueOnce(rows({ id: 'lead-1', klaros_lead_id: 'kl-from-lead' }));

    expect(await resolveCallCorrelation('t1', 'CA1')).toEqual({ leadId: 'lead-1', klarosLeadId: 'kl-from-call' });
    expect(query.mock.calls[0][1]).toEqual(['t1', 'CA1']); // scoped by tenant
    expect(query.mock.calls[1][1]).toEqual(['t1', 'call-uuid']);
  });

  it("falls back to the linked lead's Klaros id when the call has none (inbound call)", async () => {
    query.mockResolvedValueOnce(rows({ id: 'call-uuid', klaros_lead_id: null }));
    query.mockResolvedValueOnce(rows({ id: 'lead-1', klaros_lead_id: 'kl-from-lead' }));
    expect(await resolveCallCorrelation('t1', 'CA1')).toEqual({ leadId: 'lead-1', klarosLeadId: 'kl-from-lead' });
  });

  it('returns nothing when nothing is linked, rather than guessing', async () => {
    query.mockResolvedValueOnce(rows({ id: 'call-uuid', klaros_lead_id: null }));
    query.mockResolvedValueOnce(rows());
    expect(await resolveCallCorrelation('t1', 'CA1')).toEqual({ leadId: undefined, klarosLeadId: undefined });

    query.mockResolvedValueOnce(rows());
    expect(await resolveCallCorrelation('t1', 'CA-unknown')).toEqual({ leadId: undefined, klarosLeadId: undefined });
    expect(await resolveCallCorrelation('t1', undefined)).toEqual({});
  });

  it('never throws — a database failure yields no correlation', async () => {
    query.mockRejectedValue(new Error('db down'));
    expect(await resolveCallCorrelation('t1', 'CA1')).toEqual({});
  });
});

describe('resolveAppointmentCorrelation', () => {
  const withLeads = (...leads: any[]) => {
    query.mockResolvedValueOnce(rows({ phone: '+15550001' }));
    query.mockResolvedValueOnce(rows(...leads));
  };

  it('resolves both ids when exactly one lead matches the appointment phone', async () => {
    withLeads({ id: 'lead-1', klaros_lead_id: 'kl-1' });
    expect(await resolveAppointmentCorrelation('t1', 'appt-1')).toEqual({ leadId: 'lead-1', klarosLeadId: 'kl-1' });
    expect(query.mock.calls[0][1]).toEqual(['appt-1', 't1']);
    expect(query.mock.calls[1][1]).toEqual(['t1', '+15550001']);
  });

  it('does not guess the lead when several leads share the phone', async () => {
    withLeads({ id: 'lead-1', klaros_lead_id: 'kl-1' }, { id: 'lead-2', klaros_lead_id: 'kl-2' });
    expect(await resolveAppointmentCorrelation('t1', 'appt-1')).toEqual({ leadId: undefined, klarosLeadId: undefined });
  });

  it('returns a Klaros id when every matching lead agrees on it, but still no lead id', async () => {
    withLeads({ id: 'lead-1', klaros_lead_id: 'kl-1' }, { id: 'lead-2', klaros_lead_id: 'kl-1' });
    expect(await resolveAppointmentCorrelation('t1', 'appt-1')).toEqual({ leadId: undefined, klarosLeadId: 'kl-1' });
  });

  it('returns the lead id but no Klaros id when the lead has none', async () => {
    withLeads({ id: 'lead-1', klaros_lead_id: null });
    expect(await resolveAppointmentCorrelation('t1', 'appt-1')).toEqual({ leadId: 'lead-1', klarosLeadId: undefined });
  });

  it.each([
    ['no matching lead', () => { query.mockResolvedValueOnce(rows({ phone: '+1555' })); query.mockResolvedValueOnce(rows()); }],
    ['unknown appointment', () => query.mockResolvedValueOnce(rows())],
    ['placeholder phone', () => query.mockResolvedValueOnce(rows({ phone: 'unknown' }))],
    ['empty phone', () => query.mockResolvedValueOnce(rows({ phone: '' }))],
  ])('resolves nothing for %s', async (_n, setup) => {
    setup();
    const result = await resolveAppointmentCorrelation('t1', 'appt-1');
    expect(result.leadId).toBeUndefined();
    expect(result.klarosLeadId).toBeUndefined();
  });

  it('never throws — a database failure yields no correlation', async () => {
    query.mockRejectedValue(new Error('db down'));
    expect(await resolveAppointmentCorrelation('t1', 'appt-1')).toEqual({});
  });
});

describe('Klaros event data (camelCase) — exactly what is emitted per event', () => {
  const event = (eventType: string, payload: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    ({
      eventId: 'evt-1',
      eventType,
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      producedBy: 'test',
      tenantId: 'tenant-1',
      payload,
      ...extra,
    }) as any;

  /** The last step dispatched for the event (call.completed for a finalized call). */
  const emitted = async (e: any, meta?: { finalAttempt?: boolean }) => {
    await handleKlarosWebhookEvent(e, meta);
    const [tenantId, steps] = dispatch.mock.calls[0];
    const step = steps[steps.length - 1];
    return { tenantId, type: step.type, eventId: step.eventId, data: JSON.parse(JSON.stringify(step.data)) }; // drop undefined like JSON does
  };

  it('lead.qualified carries callId, leadId and klarosLeadId plus the qualification', async () => {
    const out = await emitted(
      event('LEAD_QUALIFIED', {
        callId: 'CA1', leadId: 'lead-1', klarosLeadId: 'kl-1', status: 'qualified',
        fields: { name: 'Ada' }, missingFields: [], reason: 'ok', confidence: 0.9,
      }, { callSid: 'CA1' })
    );
    expect(out).toMatchObject({ tenantId: 'tenant-1', type: 'lead.qualified', eventId: 'evt-1' });
    expect(out.data).toEqual({
      leadId: 'lead-1', callId: 'CA1', klarosLeadId: 'kl-1', status: 'qualified',
      fields: { name: 'Ada' }, missingFields: [], reason: 'ok', confidence: 0.9,
    });
  });

  it('lead.escalated carries callId, leadId, klarosLeadId, target and reason', async () => {
    const out = await emitted(
      event('LEAD_ESCALATED', { callId: 'CA1', leadId: 'lead-1', klarosLeadId: 'kl-1', target: '+15551234', reason: 'emergency' }, { callSid: 'CA1' })
    );
    expect(out.type).toBe('lead.escalated');
    expect(out.data).toEqual({ callId: 'CA1', leadId: 'lead-1', klarosLeadId: 'kl-1', target: '+15551234', reason: 'emergency' });
  });

  it('lead.escalated omits ids it could not resolve instead of inventing them', async () => {
    const out = await emitted(event('LEAD_ESCALATED', { callId: 'CA1', target: '+1', reason: 'x' }, { callSid: 'CA1' }));
    expect(out.data).toEqual({ callId: 'CA1', target: '+1', reason: 'x' });
  });

  it.each([
    ['APPOINTMENT_CREATED', 'appointment.confirmed', { appointmentId: 'a1', scheduledTime: '2030-01-01T10:00:00Z', phone: '+1555', leadId: 'lead-1', klarosLeadId: 'kl-1' }, { appointmentId: 'a1', scheduledTime: '2030-01-01T10:00:00Z', leadId: 'lead-1', klarosLeadId: 'kl-1' }],
    ['APPOINTMENT_RESCHEDULED', 'appointment.rescheduled', { appointmentId: 'a1', scheduledTime: '2030-02-01T10:00:00Z', leadId: 'lead-1', klarosLeadId: 'kl-1' }, { appointmentId: 'a1', scheduledTime: '2030-02-01T10:00:00Z', leadId: 'lead-1', klarosLeadId: 'kl-1' }],
    ['APPOINTMENT_CANCELLED', 'appointment.cancelled', { appointmentId: 'a1', reason: 'no longer needed', klarosLeadId: 'kl-1' }, { appointmentId: 'a1', reason: 'no longer needed', klarosLeadId: 'kl-1' }],
  ])('%s -> %s includes the lead correlation and never the phone number', async (internal, external, payload, expected) => {
    const out = await emitted(event(internal, payload));
    expect(out.type).toBe(external);
    expect(out.data).toEqual(expected);
    expect(JSON.stringify(out.data)).not.toContain('+1555');
  });

  it('call.completed carries the final qualification and Klaros id but not the caller phone', async () => {
    const out = await emitted(
      event('CALL_ENDED', {
        callSid: 'CA1', durationMs: 4200, callerPhone: '+15559998888', hasTranscript: true,
        klarosLeadId: 'kl-1', qualificationStatus: 'qualified', escalation: undefined,
      }, { callSid: 'CA1' })
    );
    expect(out.type).toBe('call.completed');
    expect(out.data).toEqual({ callId: 'CA1', durationMs: 4200, klarosLeadId: 'kl-1', qualificationStatus: 'qualified' });
    expect(JSON.stringify(out.data)).not.toContain('+1555999');
  });

  describe('call finalization is delivered as an ORDERED sequence', () => {
    const finalized = (payload: Record<string, unknown>) =>
      event('CALL_ENDED', { callSid: 'CA1', durationMs: 4200, qualificationStatus: 'qualified', klarosLeadId: 'kl-1', ...payload }, { callSid: 'CA1' });
    const stepsOf = () => dispatch.mock.calls[0][1] as Array<{ type: string; eventId: string; data: any }>;

    it('lead.qualified is the first step and call.completed the last, with stable derived ids', async () => {
      await handleKlarosWebhookEvent(
        finalized({
          qualificationEvent: {
            status: 'qualified', leadId: 'lead-1', klarosLeadId: 'kl-1', fields: { name: 'Ada' },
            missingFields: [], reason: 'Booked', confidence: 0.9,
          },
        })
      );

      expect(stepsOf().map((s) => s.type)).toEqual(['lead.qualified', 'call.completed']);
      expect(stepsOf().map((s) => s.eventId)).toEqual(['evt-1:lead.qualified', 'evt-1']);
      expect(JSON.parse(JSON.stringify(stepsOf()[0].data))).toEqual({
        leadId: 'lead-1', callId: 'CA1', klarosLeadId: 'kl-1', status: 'qualified',
        fields: { name: 'Ada' }, missingFields: [], reason: 'Booked', confidence: 0.9,
      });
      expect(stepsOf()[1].data.qualificationStatus).toBe('qualified');
    });

    it('without a qualification payload only call.completed is sent', async () => {
      await handleKlarosWebhookEvent(finalized({ qualificationStatus: 'unknown' }));
      expect(stepsOf().map((s) => s.type)).toEqual(['call.completed']);
    });

    it('an "unknown" qualification payload is never announced as lead.qualified', async () => {
      await handleKlarosWebhookEvent(finalized({ qualificationEvent: { status: 'unknown', reason: 'n/a' } }));
      expect(stepsOf().map((s) => s.type)).toEqual(['call.completed']);
    });

    it('forwards the bus finalAttempt flag so a permanently failing step cannot block call.completed', async () => {
      await handleKlarosWebhookEvent(finalized({}), { finalAttempt: true });
      expect(dispatch.mock.calls[0][2]).toEqual({ finalAttempt: true });
    });
  });

  it('ignores platform events that have no Klaros mapping', async () => {
    await handleKlarosWebhookEvent(event('SMS_SENT', {}));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('rethrows dispatch failures so the event bus retries them', async () => {
    dispatch.mockRejectedValueOnce(new Error('klaros down'));
    await expect(handleKlarosWebhookEvent(event('CALL_ENDED', { callSid: 'CA1' }, { callSid: 'CA1' }))).rejects.toThrow('klaros down');
  });
});
