/**
 * Plan Gating Middleware — no-op skeleton stub.
 * Billing/plan tiers were removed; all features are allowed until a plan model is reintroduced.
 */

import type { Request, Response, NextFunction } from 'express';

export function requirePlan(_feature: 'customVoice' | 'hipaa' | 'sla' | 'advancedAnalytics' | 'apiAccess') {
  return (_req: Request, _res: Response, next: NextFunction) => {
    next();
  };
}

export function requireProfessionalOrHigher() {
  return (_req: Request, _res: Response, next: NextFunction) => {
    next();
  };
}
