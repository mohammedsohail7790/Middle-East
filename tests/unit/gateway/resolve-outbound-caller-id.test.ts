import { describe, expect, it, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();

vi.mock('../../../apps/gateway/src/services/voice/tenant-scope.js', () => ({
  voiceDb: { query: queryMock },
}));

describe('resolveOutboundCallerId', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('returns tenant-owned number when phoneNumberId is provided', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: 'num-1', phone_number: '+15551234567', ai_agent_id: 'agent-1' }],
    });
    const { resolveOutboundCallerId } = await import(
      '../../../apps/gateway/src/services/voice/resolve-outbound-caller-id.js'
    );
    const result = await resolveOutboundCallerId('tenant-a', { phoneNumberId: 'num-1' });
    expect(result).toEqual({
      fromNumber: '+15551234567',
      agentId: 'agent-1',
      phoneNumberId: 'num-1',
    });
  });

  it('returns null when phoneNumberId belongs to another tenant', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const { resolveOutboundCallerId } = await import(
      '../../../apps/gateway/src/services/voice/resolve-outbound-caller-id.js'
    );
    const result = await resolveOutboundCallerId('tenant-a', { phoneNumberId: 'num-other' });
    expect(result).toBeNull();
  });
});
