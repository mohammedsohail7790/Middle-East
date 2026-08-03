import { logger } from '../logger.js';

class VoiceAlertService {
    private errorCount = 0;
    private callCount = 0;
    private integrationFailures = 0;
    private latencySamples: number[] = [];
    private readonly highErrorRateThreshold = Number(process.env.VOICE_ALERT_ERROR_RATE_THRESHOLD || 0.2);
    private readonly highLatencyThresholdMs = Number(process.env.VOICE_ALERT_LATENCY_MS_THRESHOLD || 3000);
    private readonly integrationFailureThreshold = Number(process.env.VOICE_ALERT_INTEGRATION_FAILURE_THRESHOLD || 5);

    onCallStarted(): void {
        this.callCount += 1;
    }

    async onCallError(tenantId: string, reason: string): Promise<void> {
        this.errorCount += 1;
        const errorRate = this.callCount > 0 ? this.errorCount / this.callCount : 0;
        if (errorRate >= this.highErrorRateThreshold) {
            await this.sendAlert('high_error_rate', { tenantId, reason, errorRate });
        }
    }

    async onLatency(latencyMs: number, tenantId: string): Promise<void> {
        if (latencyMs <= 0) return;
        this.latencySamples.push(latencyMs);
        if (this.latencySamples.length > 500) this.latencySamples.shift();
        const avg = this.latencySamples.reduce((sum, v) => sum + v, 0) / this.latencySamples.length;
        if (avg >= this.highLatencyThresholdMs) {
            await this.sendAlert('high_latency', { tenantId, averageLatencyMs: Math.round(avg) });
        }
    }

    async onIntegrationFailure(tenantId: string, provider: string, error: string): Promise<void> {
        this.integrationFailures += 1;
        if (this.integrationFailures >= this.integrationFailureThreshold) {
            await this.sendAlert('integration_failures', {
                tenantId,
                provider,
                error,
                count: this.integrationFailures,
            });
            this.integrationFailures = 0;
        }
    }

    private async sendAlert(type: string, payload: Record<string, unknown>): Promise<void> {
        const webhook = process.env.VOICE_ALERT_WEBHOOK_URL;
        logger.error('voice.alert.triggered', { type, ...payload });
        if (!webhook) return;

        try {
            const response = await fetch(webhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source: 'call_iq_voice',
                    type,
                    payload,
                    timestamp: new Date().toISOString(),
                }),
            });
            if (!response.ok) {
                logger.error('voice.alert.webhook_failed', { type, status: response.status });
            }
        } catch (error) {
            logger.error('voice.alert.webhook_error', { type, error: String(error) });
        }
    }
}

export const voiceAlertService = new VoiceAlertService();
