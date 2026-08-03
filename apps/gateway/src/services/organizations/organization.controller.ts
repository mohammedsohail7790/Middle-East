/**
 * ORG-001 API:
 *   POST   /organizations
 *   GET    /organizations
 *   GET    /organizations/:slug
 *   PATCH  /organizations/:id
 */

import express from 'express';
import { requireSupabaseUser } from '../auth/require-supabase-user.js';
import { clientErrorMessage } from '../../security/safe-error.js';
import { logger } from '../logger.js';
import {
    createOrganization,
    getOrganizationByIdForUser,
    getOrganizationBySlugForUser,
    listOrganizationsForUser,
    updateOrganization,
} from './organization.service.js';

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function authUserId(req: express.Request): string | undefined {
    return (req as { authUserId?: string }).authUserId;
}

export function createOrganizationsRouter(): express.Router {
    const router = express.Router();

    router.post('/', requireSupabaseUser, async (req, res) => {
        try {
            const createdBy = authUserId(req);
            if (!createdBy) {
                return res.status(401).json({ success: false, error: 'Unauthorized' });
            }

            const result = await createOrganization({
                name: req.body?.name ?? req.body?.business_name,
                description: req.body?.description,
                createdBy,
            });
            const status = result.existing ? 200 : 201;
            return res.status(status).json({
                success: true,
                data: { ...result.organization, existing: result.existing },
            });
        } catch (error) {
            const status = (error as { status?: number })?.status || 500;
            logger.error('Failed to create organization', { error: String(error) });
            return res.status(status).json({
                success: false,
                error: clientErrorMessage(error, 'Failed to create organization'),
            });
        }
    });

    router.get('/', requireSupabaseUser, async (req, res) => {
        try {
            const userId = authUserId(req);
            if (!userId) {
                return res.status(401).json({ success: false, error: 'Unauthorized' });
            }
            const items = await listOrganizationsForUser(userId);
            return res.json({ success: true, data: items });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: clientErrorMessage(error, 'Request failed'),
            });
        }
    });

    router.patch('/:id', requireSupabaseUser, async (req, res) => {
        try {
            const userId = authUserId(req);
            if (!userId) {
                return res.status(401).json({ success: false, error: 'Unauthorized' });
            }
            const id = String(req.params.id || '');
            if (!UUID_RE.test(id)) {
                return res.status(400).json({ success: false, error: 'Invalid organization id' });
            }

            const organization = await updateOrganization(id, userId, {
                name: req.body?.name,
                description: req.body?.description,
            });
            return res.json({ success: true, data: organization });
        } catch (error) {
            const status = (error as { status?: number })?.status || 500;
            return res.status(status).json({
                success: false,
                error: clientErrorMessage(error, 'Failed to update organization'),
            });
        }
    });

    // GET by slug (or UUID for convenience)
    router.get('/:slug', requireSupabaseUser, async (req, res) => {
        try {
            const userId = authUserId(req);
            if (!userId) {
                return res.status(401).json({ success: false, error: 'Unauthorized' });
            }
            const key = String(req.params.slug || '').trim();
            if (!key) {
                return res.status(400).json({ success: false, error: 'slug is required' });
            }

            const organization = UUID_RE.test(key)
                ? await getOrganizationByIdForUser(key, userId)
                : await getOrganizationBySlugForUser(key, userId);

            return res.json({ success: true, data: organization });
        } catch (error) {
            const status = (error as { status?: number })?.status || 500;
            return res.status(status).json({
                success: false,
                error: clientErrorMessage(error, 'Request failed'),
            });
        }
    });

    return router;
}
