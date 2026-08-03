import type { Request } from 'express';
import { getTenantId } from '../auth/tenant-context.js';

export function getKnowledgeTenantId(req: Request): string | null {
  try {
    return getTenantId(req);
  } catch {
    const header = req.header('x-tenant-id');
    return header?.trim() || null;
  }
}
