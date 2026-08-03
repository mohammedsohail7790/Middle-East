import { describe, expect, it } from 'vitest';
import {
  freshsalesCreateRecordUrl,
  freshsalesHealthCheckUrl,
  freshsalesVerifyUrls,
  isFreshsalesSuiteApi,
} from '../../../apps/gateway/src/services/integrations/providers/freshsales.provider.js';

describe('FreshsalesProvider helpers', () => {
  const suiteConfig = {
    accessToken: 'oauth-token',
    domain: 'acme',
    orgDomain: 'acme.myfreshworks.com',
    apiBaseUrl: 'https://acme.myfreshworks.com/crm/sales/api',
  };

  const suiteApiKeyConfig = {
    apiKey: 'api-key',
    domain: 'acme.myfreshworks.com',
  };

  const legacyConfig = {
    apiKey: 'legacy-key',
    domain: 'acme',
  };

  it('detects Suite API base', () => {
    expect(isFreshsalesSuiteApi(suiteConfig)).toBe(true);
    expect(isFreshsalesSuiteApi(suiteApiKeyConfig)).toBe(true);
    expect(isFreshsalesSuiteApi(legacyConfig)).toBe(false);
  });

  it('tries multiple Suite verify URLs starting with selectors', () => {
    expect(freshsalesVerifyUrls(suiteConfig)[0]).toBe(
      'https://acme.myfreshworks.com/crm/sales/api/selectors/owners'
    );
    expect(freshsalesHealthCheckUrl(suiteConfig)).toBe(
      'https://acme.myfreshworks.com/crm/sales/api/selectors/owners'
    );
  });

  it('uses legacy selector health check for API key accounts', () => {
    expect(freshsalesHealthCheckUrl(legacyConfig)).toBe(
      'https://acme.freshsales.io/api/selector/owners'
    );
  });

  it('creates contacts for Suite and leads for legacy', () => {
    expect(freshsalesCreateRecordUrl(suiteConfig)).toBe(
      'https://acme.myfreshworks.com/crm/sales/api/contacts'
    );
    expect(freshsalesCreateRecordUrl(suiteApiKeyConfig)).toBe(
      'https://acme.myfreshworks.com/crm/sales/api/contacts'
    );
    expect(freshsalesCreateRecordUrl(legacyConfig)).toBe('https://acme.freshsales.io/api/leads');
  });
});
