import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('assertProductionSafety', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('allows development with dangerous flags', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DEV_TENANT_ID = 'test-tenant';
    process.env.ALLOW_INSECURE_TLS = 'true';

    const { assertProductionSafety } = await import(
      '../../../apps/gateway/src/security/production-safety.js'
    );
    expect(() => assertProductionSafety()).not.toThrow();
  });

  it('blocks DEV_TENANT_ID in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DEV_TENANT_ID = 'test-tenant';

    const { assertProductionSafety } = await import(
      '../../../apps/gateway/src/security/production-safety.js'
    );
    expect(() => assertProductionSafety()).toThrow(/DEV_TENANT_ID/);
  });

  it('blocks ALLOW_INSECURE_TLS in staging', async () => {
    process.env.NODE_ENV = 'staging';
    process.env.ALLOW_INSECURE_TLS = 'true';

    const { assertProductionSafety } = await import(
      '../../../apps/gateway/src/security/production-safety.js'
    );
    expect(() => assertProductionSafety()).toThrow(/ALLOW_INSECURE_TLS/);
  });
});
