import type { Request, Response, NextFunction } from 'express';
import { requireVoiceApiAccess } from '../services/voice/security.js';

/** OAuth callbacks, webhooks, and public plan list skip Bearer auth. */
const PUBLIC_PATH_RE = /\/(callback|webhook)(\/|$)/;

export function voiceAuthUnlessPublic(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    if (req.method === 'OPTIONS') {
        next();
        return;
    }
    if (req.path === '/plans' || req.path === '/plan-definitions' || PUBLIC_PATH_RE.test(req.path)) {
        next();
        return;
    }
    void requireVoiceApiAccess(req, res, next);
}
