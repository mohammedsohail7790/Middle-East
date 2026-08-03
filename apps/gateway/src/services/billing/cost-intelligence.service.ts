import { logger } from '../logger.js';

interface CostRate {
    perTokenInput: number;
    perTokenOutput: number;
    perAudioInputSecond: number;
    perAudioOutputSecond: number;
    perMinute: number;
    perSms: number;
    perEmbedding: number;
}

const REALTIME_RATES: CostRate = {
    perTokenInput: 0.00002,
    perTokenOutput: 0.00008,
    perAudioInputSecond: 0.0004,
    perAudioOutputSecond: 0.0016,
    perMinute: 0,
    perSms: 0,
    perEmbedding: 0,
};

const TWILIO_RATES: CostRate = {
    perTokenInput: 0,
    perTokenOutput: 0,
    perAudioInputSecond: 0,
    perAudioOutputSecond: 0,
    perMinute: 0.014,
    perSms: 0.0079,
    perEmbedding: 0,
};

const EMBEDDING_RATES: CostRate = {
    perTokenInput: 0,
    perTokenOutput: 0,
    perAudioInputSecond: 0,
    perAudioOutputSecond: 0,
    perMinute: 0,
    perSms: 0,
    perEmbedding: 0.00000013,
};

export interface CallCostBreakdown {
    callId: string;
    tenantId: string;
    sessionId?: string;
    durationMs: number;
    openaiRealtime: {
        inputTokens: number;
        outputTokens: number;
        audioInputSeconds: number;
        audioOutputSeconds: number;
        estimatedCost: number;
    };
    twilio: {
        minutes: number;
        smsCount: number;
        estimatedCost: number;
    };
    embeddings: {
        count: number;
        estimatedCost: number;
    };
    totalEstimatedCost: number;
}

export interface TenantProfitability {
    tenantId: string;
    plan: string;
    subscriptionAmount: number;
    totalCalls: number;
    totalCost: number;
    grossMargin: number;
    grossMarginPercent: number;
    averageCostPerCall: number;
    projectedMonthlyCost: number;
    projectedMonthlyRevenue: number;
    projectedMonthlyMargin: number;
}

export class CostIntelligenceService {
    private callCosts = new Map<string, CallCostBreakdown>();

    estimateRealtimeCost(
        inputTokens: number,
        outputTokens: number,
        audioInputSeconds: number,
        audioOutputSeconds: number
    ): number {
        const tokenCost = (inputTokens * REALTIME_RATES.perTokenInput) +
                          (outputTokens * REALTIME_RATES.perTokenOutput);
        const audioCost = (audioInputSeconds * REALTIME_RATES.perAudioInputSecond) +
                          (audioOutputSeconds * REALTIME_RATES.perAudioOutputSecond);
        return tokenCost + audioCost;
    }

    estimateTwilioCost(minutes: number, smsCount: number = 0): number {
        return (minutes * TWILIO_RATES.perMinute) + (smsCount * TWILIO_RATES.perSms);
    }

    estimateEmbeddingCost(embeddingCount: number): number {
        return embeddingCount * EMBEDDING_RATES.perEmbedding;
    }

    recordCallCost(breakdown: CallCostBreakdown): void {
        this.callCosts.set(breakdown.callId, breakdown);

        logger.info('COST_INTELLIGENCE_CALL_RECORDED', {
            callId: breakdown.callId,
            tenantId: breakdown.tenantId,
            totalCost: breakdown.totalEstimatedCost,
            durationMs: breakdown.durationMs,
        });

        if (this.callCosts.size > 10000) {
            // Map preserves insertion order — evict the oldest entry in O(1)
            const oldestKey = this.callCosts.keys().next().value;
            if (oldestKey !== undefined) this.callCosts.delete(oldestKey);
        }
    }

    async recordCallCostToDb(
        callId: string,
        tenantId: string,
        inputTokens: number,
        outputTokens: number,
        audioInputSeconds: number,
        audioOutputSeconds: number,
        callMinutes: number,
        smsCount: number
    ): Promise<void> {
        const openaiCost = this.estimateRealtimeCost(inputTokens, outputTokens, audioInputSeconds, audioOutputSeconds);
        const twilioCost = this.estimateTwilioCost(callMinutes, smsCount);
        const totalCost = openaiCost + twilioCost;

        try {
            const { voiceDb } = await import('../voice/tenant-scope.js');
            await voiceDb.query(
                `INSERT INTO public.call_costs 
                 (call_id, tenant_id, input_tokens, output_tokens, audio_input_seconds, audio_output_seconds,
                  call_minutes, sms_count, openai_cost, twilio_cost, total_cost, estimated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
                 ON CONFLICT (call_id) DO NOTHING`,
                [callId, tenantId, inputTokens, outputTokens, audioInputSeconds, audioOutputSeconds,
                 callMinutes, smsCount, openaiCost, twilioCost, totalCost]
            );
        } catch (err) {
            logger.error('COST_INTELLIGENCE_DB_WRITE_FAILED', {
                callId,
                tenantId,
                error: String(err),
            });
        }
    }

    async getTenantProfitability(tenantId: string, plan: string, subscriptionAmount: number): Promise<TenantProfitability | null> {
        try {
            const { voiceDb } = await import('../voice/tenant-scope.js');
            const result = await voiceDb.query(
                `SELECT COUNT(*) as call_count, COALESCE(SUM(total_cost), 0) as total_cost
                 FROM public.call_costs
                 WHERE tenant_id = $1 AND estimated_at >= date_trunc('month', now())`,
                [tenantId]
            );

            const row = result.rows[0];
            if (!row) return null;

            const totalCalls = parseInt(row.call_count, 10) || 0;
            const totalCost = parseFloat(row.total_cost) || 0;

            return {
                tenantId,
                plan,
                subscriptionAmount,
                totalCalls,
                totalCost,
                grossMargin: subscriptionAmount - totalCost,
                grossMarginPercent: subscriptionAmount > 0
                    ? ((subscriptionAmount - totalCost) / subscriptionAmount) * 100
                    : 0,
                averageCostPerCall: totalCalls > 0 ? totalCost / totalCalls : 0,
                projectedMonthlyCost: totalCost,
                projectedMonthlyRevenue: subscriptionAmount,
                projectedMonthlyMargin: subscriptionAmount - totalCost,
            };
        } catch (err) {
            logger.error('COST_INTELLIGENCE_PROFITABILITY_FAILED', {
                tenantId,
                error: String(err),
            });
            return null;
        }
    }

    detectAnomaly(tenantId: string, currentCost: number, averageCost: number): { isAnomaly: boolean; reason?: string } {
        if (averageCost <= 0) return { isAnomaly: false };

        const ratio = currentCost / averageCost;
        if (ratio > 3) {
            return {
                isAnomaly: true,
                reason: `Cost spike: ${ratio.toFixed(1)}x average ($${currentCost.toFixed(4)} vs $${averageCost.toFixed(4)})`,
            };
        }

        return { isAnomaly: false };
    }

    getCallCost(callId: string): CallCostBreakdown | undefined {
        return this.callCosts.get(callId);
    }

    getRecentCosts(limit: number = 100): CallCostBreakdown[] {
        // Map preserves insertion order — reverse it so most recent come first
        return [...this.callCosts.values()].reverse().slice(0, limit);
    }
}

export const costIntelligence = new CostIntelligenceService();
