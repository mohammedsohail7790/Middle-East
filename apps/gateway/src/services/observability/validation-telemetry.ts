import { logger } from '../logger.js';
import type { CallIqAuthenticatedRequest, TenantAuthSource } from '../auth/tenant-context.js';
import { correlationLogFields } from './correlation-context.js';

type HttpRequestLike = {
  originalUrl?: string;
  path?: string;
  method?: string;
  header(name: string): string | undefined;
};

/** Elevated structured logs during P0 production validation (48–72h). */
export function isValidationTelemetryEnabled(): boolean {
  return (process.env.CALLIQ_V4_VALIDATION_LOGS || 'true').toLowerCase() !== 'false';
}

export function logAuthResolution(
  req: HttpRequestLike & CallIqAuthenticatedRequest,
  input: {
    tenantId: string;
    source: TenantAuthSource;
    userId?: string;
    status: number;
    error?: string;
  }
): void {
  if (!isValidationTelemetryEnabled()) return;
  const r = req as CallIqAuthenticatedRequest;
  logger.info('V4_AUTH_RESOLUTION', {
    ...correlationLogFields({
      requestId: r.requestId,
      tenantId: input.tenantId,
      userId: input.userId,
    }),
    route: req.originalUrl || req.path,
    method: req.method,
    source: input.source,
    status: input.status,
    error: input.error,
  });
}

/**
 * Compare client-supplied tenant hint vs authoritative JWT tenant (never trust hint).
 */
export function logTenantShadowMismatch(
  req: HttpRequestLike & CallIqAuthenticatedRequest,
  input: {
    authoritativeTenantId: string;
    clientTenantHint?: string;
    source: TenantAuthSource;
    userId?: string;
  }
): void {
  if (!isValidationTelemetryEnabled()) return;
  const hint = input.clientTenantHint?.trim();
  if (!hint || hint === input.authoritativeTenantId) return;

  const r = req as CallIqAuthenticatedRequest;
  logger.warn('V4_TENANT_SHADOW_MISMATCH', {
    ...correlationLogFields({
      requestId: r.requestId,
      tenantId: input.authoritativeTenantId,
      userId: input.userId,
    }),
    route: req.originalUrl || req.path,
    method: req.method,
    clientTenantHint: hint,
    source: input.source,
    message:
      'Client tenant hint differs from JWT-authoritative tenant — stale dashboard, script, or tooling',
  });
}

export function logWsSessionEvent(
  event: string,
  fields: Record<string, string | number | boolean | undefined>
): void {
  if (!isValidationTelemetryEnabled()) return;
  logger.info('V4_WS_SESSION', { event, ...correlationLogFields(), ...fields });
}

export function logAppointmentWrite(
  action: 'create' | 'reschedule' | 'cancel' | 'backfill',
  fields: Record<string, string | number | boolean | undefined>
): void {
  if (!isValidationTelemetryEnabled()) return;
  logger.info('V4_APPOINTMENT_WRITE', { action, ...correlationLogFields(), ...fields });
}

export function logQueueDispatch(
  event: string,
  fields: Record<string, string | number | boolean | undefined>
): void {
  if (!isValidationTelemetryEnabled()) return;
  logger.info('V4_QUEUE_DISPATCH', { event, ...correlationLogFields(), ...fields });
}
