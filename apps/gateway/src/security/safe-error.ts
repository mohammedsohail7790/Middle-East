import type { Response } from 'express';
import { logger } from '../services/logger.js';

/** Client-safe JSON error — never includes stack, SQL, or internal paths. */
export function sendSafeError(
  res: Response,
  status: number,
  publicMessage: string,
  logContext?: Record<string, unknown>,
  internalError?: unknown
): void {
  if (internalError) {
    logger.error(publicMessage, {
      ...logContext,
      internal: internalError instanceof Error ? internalError.message : String(internalError),
    });
  }
  res.status(status).json({ success: false, error: publicMessage });
}

export function clientErrorMessage(err: unknown, fallback = 'Request failed'): string {
  if (process.env.NODE_ENV === 'development' && err instanceof Error) {
    return err.message;
  }
  return fallback;
}
