import { logger } from '../logger.js';
import { voiceAlertService } from './alert.service.js';

class VoiceMetrics {
    private callsStarted = 0;
    private callsFailed = 0;
    private integrationFailures = 0;
    private latencySamples: number[] = [];

    callStarted(tenantId: string): void {
        this.callsStarted += 1;
        voiceAlertService.onCallStarted();
        logger.info('voice.metrics.calls_started', { tenantId, callsStarted: this.callsStarted });
    }

    callFailed(tenantId: string, reason: string): void {
        this.callsFailed += 1;
        void voiceAlertService.onCallError(tenantId, reason);
        logger.error('voice.metrics.calls_failed', { tenantId, reason, callsFailed: this.callsFailed });
    }

    recordLatency(latencyMs: number, tenantId: string): void {
        if (latencyMs <= 0) return;
        this.latencySamples.push(latencyMs);
        if (this.latencySamples.length > 1000) this.latencySamples.shift();
        void voiceAlertService.onLatency(latencyMs, tenantId);
        logger.info('voice.metrics.latency_sample', { tenantId, latencyMs, avgLatencyMs: this.getAverageLatency() });
    }

    recordLatencyMarker(marker: string, valueMs: number, tenantId: string): void {
        logger.info('voice.metrics.latency_marker', { marker, valueMs, tenantId });
    }

    integrationFailure(tenantId: string, provider: string, error: string): void {
        this.integrationFailures += 1;
        void voiceAlertService.onIntegrationFailure(tenantId, provider, error);
        logger.error('voice.metrics.integration_failure', {
            tenantId,
            provider,
            error,
            integrationFailures: this.integrationFailures,
        });
    }

    getAverageLatency(): number {
        if (!this.latencySamples.length) return 0;
        return Math.round(this.latencySamples.reduce((sum, value) => sum + value, 0) / this.latencySamples.length);
    }
}

export const voiceMetrics = new VoiceMetrics();
