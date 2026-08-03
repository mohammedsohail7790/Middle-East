import { createHmac, timingSafeEqual } from 'crypto';
import { getInternalApiKey } from '../../security/secrets.js';

export type InternalApiScope =
  | 'tenant:read'
  | 'tenant:write'
  | 'voice:admin'
  | 'billing:admin'
  | 'integrations:write';

const DEFAULT_INTERNAL_SCOPES: InternalApiScope[] = [
  'tenant:read',
  'tenant:write',
  'voice:admin',
  'integrations:write',
];

export interface VerifiedInternalService {
  tenantId: string;
  scopes: InternalApiScope[];
  serviceId: string;
}

function parseScopesHeader(raw: string | undefined): InternalApiScope[] {
  if (!raw?.trim()) return DEFAULT_INTERNAL_SCOPES;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) as InternalApiScope[];
}

function verifyServiceSignature(
  tenantId: string,
  timestamp: string,
  signature: string
): boolean {
  const secret = process.env.INTERNAL_SERVICE_SIGNING_SECRET || process.env.JWT_SECRET;
  if (!secret || !timestamp || !signature) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 5 * 60 * 1000) {
    return false;
  }

  const payload = `${tenantId}.${timestamp}`;
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  try {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Machine-to-machine auth: API key + mandatory tenant header.
 * Optional HMAC signature when INTERNAL_SERVICE_SIGNING_SECRET is set.
 */
export function verifyInternalServiceRequest(input: {
  apiKey: string | undefined;
  tenantIdHeader: string | undefined;
  scopesHeader?: string | undefined;
  timestampHeader?: string | undefined;
  signatureHeader?: string | undefined;
  requiredScope?: InternalApiScope;
}): VerifiedInternalService | { error: string; status: number } {
  const configuredKey = getInternalApiKey();
  if (!configuredKey || !input.apiKey) {
    return { error: 'Unauthorized', status: 401 };
  }
  try {
    const a = Buffer.from(configuredKey, 'utf8');
    const b = Buffer.from(input.apiKey, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { error: 'Unauthorized', status: 401 };
    }
  } catch {
    return { error: 'Unauthorized', status: 401 };
  }

  const tenantId = input.tenantIdHeader?.trim();
  if (!tenantId) {
    return { error: 'x-tenant-id required for internal service calls', status: 400 };
  }

  const signingRequired = Boolean(process.env.INTERNAL_SERVICE_SIGNING_SECRET);
  if (signingRequired) {
    const ok = verifyServiceSignature(
      tenantId,
      input.timestampHeader || '',
      input.signatureHeader || ''
    );
    if (!ok) {
      return { error: 'Invalid internal service signature', status: 401 };
    }
  }

  const scopes = parseScopesHeader(input.scopesHeader);
  if (input.requiredScope && !scopes.includes(input.requiredScope)) {
    return { error: 'Insufficient internal API scope', status: 403 };
  }

  return {
    tenantId,
    scopes,
    serviceId: 'voice-internal',
  };
}
