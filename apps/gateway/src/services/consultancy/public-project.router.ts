import { Router } from 'express';
import { MiddlewareFactory } from '../../middleware/index.js';
import { logger } from '../logger.js';
import { verifyLink } from '../audit/signed-link.js';
import { getPublicProjectView, type Queryable } from './project-store.js';
import { renderInvalidProjectPage, renderProjectPage } from './project-pages.js';

/**
 * The read-only project status page a client opens from a private signed link. Mounted at /api/v1/public/project and listed in the public allowlist (middleware/api-auth-unless-public.ts), so these routes carry no
 * login: every one of them must verify its signed link itself. Only GET exists. A bad, expired, wrong-kind or unknown-project link all get the same neutral page.
 */
const limit = MiddlewareFactory.createRateLimit({ windowMs: 15 * 60 * 1000, max: 120, message: 'Too many requests. Please try again later.' });

export function createPublicProjectRouter(deps: { pool?: Queryable; now?: () => Date } = {}): Router {
  const router = Router();
  const getPool = async (): Promise<Queryable> => deps.pool ?? ((await import('../db/pool.js')).pool as unknown as Queryable);

  router.get('/', limit, async (req, res) => {
    const neutral = () => void res.status(404).set('Cache-Control', 'no-store').type('html').send(renderInvalidProjectPage());
    try {
      const secret = process.env.AUDIT_LINK_SECRET;
      const token = typeof req.query.t === 'string' ? req.query.t : '';
      const r = secret ? verifyLink(token, secret, deps.now?.().getTime()) : null;
      if (!r || !r.ok || r.payload.k !== 'project') return neutral();
      const view = await getPublicProjectView(await getPool(), r.payload.id, deps.now?.(), r.payload.v ?? 1);
      if (!view) return neutral();
      res.set('Cache-Control', 'no-store').set('Referrer-Policy', 'no-referrer').type('html').send(renderProjectPage(view));
    } catch (err) {
      logger.error('public project page failed', { error: err instanceof Error ? err.message : String(err) });
      neutral();
    }
  });
  return router;
}
