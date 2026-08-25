import { describe, expect, it, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();

vi.mock('../../../apps/gateway/src/services/voice/tenant-scope.js', () => ({
  voiceDb: { query: queryMock },
}));

vi.mock('../../../apps/gateway/src/services/voice/redis.client.js', () => ({
  voiceRedis: {
    get: vi.fn(),
    setex: vi.fn(),
  },
}));

describe('outbound call helpers', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('parseCampaignCallContext reads openingContext from jsonb object', async () => {
    const { parseCampaignCallContext } = await import(
      '../../../apps/gateway/src/services/voice/outbound.service.js'
    );
    expect(parseCampaignCallContext({ openingContext: 'Follow up on quote' })).toBe(
      'Follow up on quote'
    );
    expect(parseCampaignCallContext(JSON.stringify({ openingContext: 'Reminder' }))).toBe('Reminder');
    expect(parseCampaignCallContext(null)).toBeUndefined();
  });

  it('handleTwilioCallStatus marks campaign call completed and refreshes stats', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ campaign_call_id: 'cc-1' }] })
      .mockResolvedValueOnce({ rows: [{ campaign_id: 'camp-1' }] })
      .mockResolvedValueOnce({
        rows: [{ completed_count: 1, success_count: 1, failed_count: 0, remaining: 0 }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const { handleTwilioCallStatus } = await import(
      '../../../apps/gateway/src/services/voice/outbound.service.js'
    );

    await handleTwilioCallStatus({
      callSid: 'CA123',
      callStatus: 'completed',
      callDuration: '42',
    });

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE public.campaign_calls'),
      ['cc-1', 'completed', 'completed']
    );
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE public.campaigns'),
      expect.arrayContaining(['camp-1', 1, 1, 0, 'completed'])
    );
  });
});
