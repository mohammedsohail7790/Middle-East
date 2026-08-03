import { requireVoiceApiAccess } from '../voice/security.js';
import { costIntelligence } from './cost-intelligence.service.js';
import { logger } from '../logger.js';
import express from 'express';

export function createCostRouter(): express.Router {
    const router = express.Router();

    router.use(requireVoiceApiAccess);

    router.get('/call/:callId', async (req: any, res: any) => {
        try {
            const cost = costIntelligence.getCallCost(req.params.callId);
            if (!cost) {
                return res.status(404).json({ success: false, error: 'Call cost not found' });
            }
            res.json({ success: true, data: cost });
        } catch (error) {
            logger.error('Failed to get call cost', { error: String(error) });
            res.status(500).json({ success: false, error: 'Internal server error' });
        }
    });

    router.get('/recent', async (_req: any, res: any) => {
        try {
            const costs = costIntelligence.getRecentCosts(100);
            res.json({ success: true, data: costs });
        } catch (error) {
            logger.error('Failed to get recent costs', { error: String(error) });
            res.status(500).json({ success: false, error: 'Internal server error' });
        }
    });

    router.get('/profitability/:tenantId', async (req: any, res: any) => {
        try {
            const { plan, subscriptionAmount } = req.query;
            const profitability = await costIntelligence.getTenantProfitability(
                req.params.tenantId,
                String(plan || 'unknown'),
                Number(subscriptionAmount || 0)
            );
            if (!profitability) {
                return res.status(404).json({ success: false, error: 'No cost data found' });
            }
            res.json({ success: true, data: profitability });
        } catch (error) {
            logger.error('Failed to get profitability', { error: String(error) });
            res.status(500).json({ success: false, error: 'Internal server error' });
        }
    });

    router.post('/record', async (req: any, res: any) => {
        try {
            const { callId, tenantId, inputTokens, outputTokens, audioInputSeconds, audioOutputSeconds, callMinutes, smsCount } = req.body;
            if (!callId || !tenantId) {
                return res.status(400).json({ success: false, error: 'callId and tenantId required' });
            }

            await costIntelligence.recordCallCostToDb(
                callId, tenantId,
                inputTokens || 0, outputTokens || 0,
                audioInputSeconds || 0, audioOutputSeconds || 0,
                callMinutes || 0, smsCount || 0
            );

            res.json({ success: true });
        } catch (error) {
            logger.error('Failed to record call cost', { error: String(error) });
            res.status(500).json({ success: false, error: 'Internal server error' });
        }
    });

    return router;
}
