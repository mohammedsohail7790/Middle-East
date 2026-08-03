import { describe, expect, it } from 'vitest';
import { hubspotRefreshTokenFromMetadata } from '../../../apps/gateway/src/services/integrations/hubspot-token.service.js';

describe('hubspot-token.service', () => {
  it('reads refresh token from tenant metadata', () => {
    expect(
      hubspotRefreshTokenFromMetadata({ hubspot_refresh_token: 'rt-abc' })
    ).toBe('rt-abc');
    expect(hubspotRefreshTokenFromMetadata({})).toBeNull();
    expect(hubspotRefreshTokenFromMetadata(null)).toBeNull();
  });
});
