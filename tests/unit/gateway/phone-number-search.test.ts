import { describe, expect, it, vi } from 'vitest';
import { PhoneProvisioningService } from '../../../apps/gateway/src/services/phone-provisioning/phoneProvisioning.service';

function clientReturning(results: Array<unknown[] | Error>) {
  const list = vi.fn();
  for (const r of results) {
    if (r instanceof Error) list.mockRejectedValueOnce(r);
    else list.mockResolvedValueOnce(r);
  }
  return { client: { availablePhoneNumbers: () => ({ local: { list } }) } as never, list };
}

const NUM = { phoneNumber: '+19785197879', friendlyName: '(978) 519-7879', locality: 'Lowell', region: 'MA', capabilities: { voice: true, sms: true, mms: true } };

describe('phone number search', () => {
  const svc = new PhoneProvisioningService();

  it('returns numbers with the fields the dashboard reads', async () => {
    const { client } = clientReturning([[NUM]]);
    const [n] = await svc.searchAvailable('978', 10, client);
    expect(n.phoneNumber).toBe('+19785197879');
    expect(n.capabilities).toEqual(['voice', 'sms', 'mms']);
    expect(n.cost).toBe(1.15);
    expect(n.region).toBe('Lowell, MA');
  });

  it('falls back to voice-only, then to no filter, when the stricter search is empty', async () => {
    const { client, list } = clientReturning([[], [], [NUM]]);
    const out = await svc.searchAvailable('978', 10, client);
    expect(out).toHaveLength(1);
    expect(list).toHaveBeenCalledTimes(3);
    expect(list.mock.calls[0][0]).toMatchObject({ voiceEnabled: true, smsEnabled: true });
    expect(list.mock.calls[1][0]).toMatchObject({ voiceEnabled: true });
    expect(list.mock.calls[1][0].smsEnabled).toBeUndefined();
    expect(list.mock.calls[2][0].voiceEnabled).toBeUndefined();
  });

  it('returns an empty list only when every attempt is empty', async () => {
    const { client } = clientReturning([[], [], []]);
    expect(await svc.searchAvailable('415', 10, client)).toEqual([]);
  });

  it('reports a Twilio error as an error, not as "no numbers"', async () => {
    const err = Object.assign(new Error('Authenticate'), { code: 20003, status: 401 });
    const { client } = clientReturning([err]);
    await expect(svc.searchAvailable('978', 10, client)).rejects.toThrow(/Twilio could not search.*20003/);
  });

  it('rejects an area code that is not three digits', async () => {
    const { client } = clientReturning([]);
    await expect(svc.searchAvailable('97', 10, client)).rejects.toThrow(/exactly 3 digits/);
  });
});
