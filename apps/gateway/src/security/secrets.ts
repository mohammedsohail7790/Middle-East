/**
 * Central secret access — never hard-code API keys in source.
 * Rotate by updating env vars (and JWT_SECRET_PREVIOUS for zero-downtime JWT rotation).
 */

const PLACEHOLDER_VALUES = new Set([
  '',
  'sk_test_placeholder',
  'changeme',
  'your-api-key',
  '<generate-a-secure-random-string>',
]);

export function isPlaceholderSecret(value: string | undefined | null): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (PLACEHOLDER_VALUES.has(trimmed)) return true;
  if (/^<.*>$/.test(trimmed)) return true;
  return false;
}

/**
 * Read a secret from the environment. Returns undefined when unset or placeholder.
 */
export function getSecret(name: string): string | undefined {
  const value = process.env[name];
  if (isPlaceholderSecret(value)) return undefined;
  return value;
}

/**
 * Require a secret in production; in development returns undefined with a console warning.
 */
export function requireSecret(name: string): string {
  const value = getSecret(name);
  if (value) return value;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required secret: ${name}. Set it in the deployment environment.`);
  }

  console.warn(`[secrets] ${name} is not set — feature may be disabled in development`);
  return '';
}

/** Server-only internal API key (dashboard → gateway). Never expose via NEXT_PUBLIC_*. */
export function getInternalApiKey(): string | undefined {
  return getSecret('VOICE_INTERNAL_API_KEY') ?? getSecret('INTERNAL_API_KEY');
}

/** Super-admin key for tenant listing — separate from tenant-scoped keys. */
export function getAdminApiKey(): string | undefined {
  return getSecret('ADMIN_API_KEY');
}
