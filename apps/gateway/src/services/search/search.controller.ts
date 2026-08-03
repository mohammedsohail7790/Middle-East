import express from 'express';
import { asyncHandler } from '../../middleware/index.js';
import { requireTenant } from '../../middleware/require-tenant.js';
import { getTenantId } from '../auth/tenant-context.js';
import { enterpriseSearch, type SearchCategory } from './enterprise-search.service.js';

export function createSearchRouter(): express.Router {
  const router = express.Router();
  router.use(requireTenant);

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const tenantId = getTenantId(req);
      const q = String(req.query.q || '');
      const category = (String(req.query.category || 'all') as SearchCategory) || 'all';
      const data = await enterpriseSearch(tenantId, q, category);
      res.json({ success: true, data });
    })
  );

  return router;
}
