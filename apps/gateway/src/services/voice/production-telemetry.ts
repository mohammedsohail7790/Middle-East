import { logger } from '../logger.js';

interface TelemetryEvent {
    type: string;
    callId?: string;
    tenantId?: string;
    timestamp: number;
    durationMs?: number;
    metadata?: Record<string, unknown>;
}

interface LatencyHistogram {
    p50: number;
    p95: number;
    p99: number;
    count: number;
}

class ProductionTelemetry {
    private events: TelemetryEvent[] = [];
    private latencyBuckets: Map<string, number[]> = new Map();
    private readonly maxSamples = 10000;
    private flushInterval: NodeJS.Timeout;
    private counters: Map<string, number> = new Map();

    constructor() {
        this.flushInterval = setInterval(() => this.flush(), 300000);
    }

    record(type: string, data: { callId?: string; tenantId?: string; durationMs?: number; metadata?: Record<string, unknown> }): void {
        this.events.push({ type, ...data, timestamp: Date.now() });
        if (this.events.length > this.maxSamples) this.events.shift();

        const key = this.counterKey(type, data.tenantId);
        this.counters.set(key, (this.counters.get(key) || 0) + 1);

        if (data.durationMs !== undefined) {
            const bucket = this.latencyBuckets.get(type) || [];
            bucket.push(data.durationMs);
            if (bucket.length > this.maxSamples) bucket.shift();
            this.latencyBuckets.set(type, bucket);
        }
    }

    incrementCounter(type: string, tenantId?: string): void {
        const key = this.counterKey(type, tenantId);
        this.counters.set(key, (this.counters.get(key) || 0) + 1);
    }

    getCounter(type: string, tenantId?: string): number {
        return this.counters.get(this.counterKey(type, tenantId)) || 0;
    }

    getLatencyPercentile(type: string, percentile: number): number {
        const samples = this.latencyBuckets.get(type);
        if (!samples || samples.length === 0) return 0;
        const sorted = [...samples].sort((a, b) => a - b);
        const idx = Math.floor(sorted.length * percentile / 100);
        return sorted[Math.min(idx, sorted.length - 1)];
    }

    getLatencyHistogram(type: string): LatencyHistogram {
        return {
            p50: this.getLatencyPercentile(type, 50),
            p95: this.getLatencyPercentile(type, 95),
            p99: this.getLatencyPercentile(type, 99),
            count: this.latencyBuckets.get(type)?.length || 0,
        };
    }

    getAllMetrics(): Record<string, unknown> {
        const result: Record<string, unknown> = {
            counters: Object.fromEntries(this.counters),
            upTime: process.uptime(),
            memory: process.memoryUsage(),
        };
        const latencyTypes = [...this.latencyBuckets.keys()];
        const histograms: Record<string, LatencyHistogram> = {};
        for (const t of latencyTypes) {
            histograms[t] = this.getLatencyHistogram(t);
        }
        result.latency = histograms;
        return result;
    }

    getEventsForCall(callId: string, limit = 50): TelemetryEvent[] {
        return this.events
            .filter((e) => e.callId === callId)
            .slice(-limit)
            .map(({ type, timestamp, durationMs, metadata }) => ({
                type,
                timestamp,
                durationMs,
                metadata,
            }));
    }

    private counterKey(type: string, tenantId?: string): string {
        return tenantId ? `${type}:${tenantId}` : type;
    }

    private flush(): void {
        if (this.events.length === 0) return;
        logger.info('TELEMETRY_FLUSH', {
            events: this.events.length,
            counters: Object.fromEntries(this.counters),
            uptimeSec: Math.round(process.uptime()),
        });
        this.events = [];
    }

    destroy(): void {
        clearInterval(this.flushInterval);
        this.flush();
    }
}

export const productionTelemetry = new ProductionTelemetry();
