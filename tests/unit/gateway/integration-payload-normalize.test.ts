import { describe, expect, it } from 'vitest';
import { normalizeIntegrationPayload } from '../../../apps/gateway/src/services/integrations/provider-lead-utils.js';

describe('normalizeIntegrationPayload', () => {
  it('copies appointment.time to lead.preferred_time', () => {
    const normalized = normalizeIntegrationPayload({
      callId: 'appt-1',
      type: 'appointment',
      lead: { name: 'Jane', phone: '+15551234567', service: 'AC repair' },
      appointment: {
        name: 'Jane',
        phone: '+15551234567',
        service: 'AC repair',
        time: '2026-06-21T13:00:00.000Z',
      },
    });

    expect(normalized.lead.preferred_time).toBe('2026-06-21T13:00:00.000Z');
    expect(normalized.type).toBe('appointment');
  });

  it('promotes lead with preferred_time to appointment type', () => {
    const normalized = normalizeIntegrationPayload({
      callId: 'call-1',
      lead: {
        name: 'Bob',
        phone: '+15559876543',
        service: 'HVAC',
        preferred_time: '2026-06-22T16:00:00.000Z',
      },
    });

    expect(normalized.type).toBe('appointment');
    expect(normalized.appointment?.time).toBe('2026-06-22T16:00:00.000Z');
  });
});
