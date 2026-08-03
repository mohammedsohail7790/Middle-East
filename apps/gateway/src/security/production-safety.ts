/**
 * Production safety — refuse to boot with dangerous env combinations.
 */
const FORBIDDEN_IN_PRODUCTION = [
  { key: 'DEV_TENANT_ID', reason: 'Bypasses billing enforcement for a tenant' },
  { key: 'ALLOW_INSECURE_TLS', value: 'true', reason: 'Disables TLS certificate validation' },
  { key: 'USAGE_ENFORCEMENT_FAIL_OPEN', value: 'true', reason: 'Allows unlimited usage when billing checks fail' },
  { key: 'ALLOWLIST_FAIL_OPEN', value: 'true', reason: 'Bypasses IP allowlist on infrastructure failure' },
  { key: 'NODE_TLS_REJECT_UNAUTHORIZED', value: '0', reason: 'Disables TLS certificate validation globally' },
] as const;

export function assertProductionSafety(): void {
  const env = process.env.NODE_ENV;
  if (env !== 'production' && env !== 'staging') return;

  const violations: string[] = [];
  for (const rule of FORBIDDEN_IN_PRODUCTION) {
    const raw = process.env[rule.key];
    if (!raw?.trim()) continue;
    if ('value' in rule && raw.trim().toLowerCase() !== rule.value) continue;
    violations.push(`${rule.key}: ${rule.reason}`);
  }

  if (violations.length > 0) {
    throw new Error(
      `Unsafe configuration for ${env}:\n` + violations.map((v) => `  - ${v}`).join('\n')
    );
  }
}
