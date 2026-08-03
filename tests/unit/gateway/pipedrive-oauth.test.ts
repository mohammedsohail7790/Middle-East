import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getPipedriveOAuthConfig } from '../../../apps/gateway/src/services/integrations/oauth-config.js';

const ENV_KEYS = ['PIPEDRIVE_CLIENT_ID', 'PIPEDRIVE_CLIENT_SECRET', 'GATEWAY_PUBLIC_URL'] as const;

describe('getPipedriveOAuthConfig', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('derives redirect URI from GATEWAY_PUBLIC_URL', () => {
    process.env.GATEWAY_PUBLIC_URL = 'https://call-iq-gateway.onrender.com';
    process.env.PIPEDRIVE_CLIENT_ID = 'abc123';
    process.env.PIPEDRIVE_CLIENT_SECRET = 'secret';

    expect(getPipedriveOAuthConfig()).toEqual({
      clientId: 'abc123',
      clientSecret: 'secret',
      redirectUri: 'https://call-iq-gateway.onrender.com/api/v1/integrations/pipedrive/callback',
    });
  });

  it('returns empty credentials when env vars are unset', () => {
    expect(getPipedriveOAuthConfig()).toEqual({
      clientId: '',
      clientSecret: '',
      redirectUri: 'https://call-iq-gateway.onrender.com/api/v1/integrations/pipedrive/callback',
    });
  });

  it('builds the documented Pipedrive authorize URL shape', () => {
    process.env.GATEWAY_PUBLIC_URL = 'https://call-iq-gateway.onrender.com';
    const config = getPipedriveOAuthConfig();
    const clientId = 'b4d083d9216986345b32';
    const state = 'deadbeef';
    const url =
      'https://oauth.pipedrive.com/oauth/authorize' +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(config.redirectUri)}` +
      `&state=${encodeURIComponent(state)}`;

    expect(url).toBe(
      'https://oauth.pipedrive.com/oauth/authorize' +
        '?client_id=b4d083d9216986345b32' +
        '&redirect_uri=https%3A%2F%2Fcall-iq-gateway.onrender.com%2Fapi%2Fv1%2Fintegrations%2Fpipedrive%2Fcallback' +
        '&state=deadbeef'
    );
  });
});
