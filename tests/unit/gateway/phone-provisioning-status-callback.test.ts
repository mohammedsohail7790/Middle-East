/**
 * A number we buy must report its calls to /voice/call-status. That endpoint is what turns a missed inbound call into the "text back callers I missed" automation;
 * /voice/stream-status only writes a log line, so a number pointed there never triggers it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ create: vi.fn(), query: vi.fn() }));

vi.mock('twilio', () => ({ default: () => ({ incomingPhoneNumbers: { create: mocks.create } }) }));
vi.mock('../../../apps/gateway/src/services/logger.js', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../../../apps/gateway/src/services/db/pool.js', () => ({ pool: { query: mocks.query } }));
vi.mock('../../../apps/gateway/src/services/env.js', () => ({ getGatewayPublicHttpsBase: () => 'https://gateway.example.com' }));
vi.mock('../../../apps/gateway/src/services/dashboard/dashboard-events.js', () => ({ publishDashboardPushType: vi.fn() }));

import { PhoneProvisioningService } from '../../../apps/gateway/src/services/phone-provisioning/phoneProvisioning.service.js';

describe('buying a number', () => {
  beforeEach(() => {
    process.env.TWILIO_ACCOUNT_SID = 'AC' + '0'.repeat(32);
    process.env.TWILIO_AUTH_TOKEN = 'token';
    mocks.create.mockReset().mockResolvedValue({ sid: 'PN1', friendlyName: 'Halla AI - Tenant abcd1234' });
    mocks.query.mockReset().mockImplementation(async (sql: string) => {
      if (/FROM public\.tenant_phone_numbers WHERE phone_number/.test(sql)) return { rows: [] };
      if (/INSERT INTO public\.tenant_phone_numbers/.test(sql)) return { rows: [{ id: 'row1', tenant_id: 't', phone_number: '+15550000001', twilio_sid: 'PN1', friendly_name: 'x', capabilities: {}, monthly_cost: 1.15, webhook_url: 'u', status: 'active', purchased_at: new Date() }] };
      return { rows: [] };
    });
  });

  it('sends call status to /voice/call-status so missed calls start the automation', async () => {
    const svc = new PhoneProvisioningService() as unknown as { purchaseNumber: (t: string, n: string) => Promise<unknown>; getTenantNumberStats: unknown };
    (svc as any).getTenantNumberStats = async () => ({ canAddMore: true, activeCount: 0, maxAllowed: 5 });
    await svc.purchaseNumber('abcd1234-0000-0000-0000-000000000000', '+15550000001');
    const args = mocks.create.mock.calls[0][0];
    expect(args.statusCallback).toBe('https://gateway.example.com/api/v1/voice/call-status');
    expect(args.statusCallbackMethod).toBe('POST');
    expect(args.voiceUrl).toBe('https://gateway.example.com/api/v1/voice/incoming-call');
  });
});
