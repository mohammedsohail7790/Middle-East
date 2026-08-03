/**
 * Self-contained Prometheus metrics collector.
 * No external dependencies — outputs Prometheus-format text for /metrics endpoint.
 */

function labelKey(labels?: Record<string, string>): string {
    return labels ? Object.entries(labels).sort().map(([k, v]) => `${k}="${v}"`).join(',') : '';
}

// ── Counter helpers ──
class Counter {
    private values: Map<string, number> = new Map();
    constructor(public readonly name: string, public readonly help: string, public readonly labelNames: string[] = []) {}
    inc(labels?: Record<string, string>, by = 1): void {
        const key = labelKey(labels);
        this.values.set(key, (this.values.get(key) ?? 0) + by);
    }
    reset(): void { this.values.clear(); }
    collect(): string {
        let out = `# HELP ${this.name} ${this.help}\n# TYPE ${this.name} counter\n`;
        if (this.values.size === 0) {
            return out + `${this.name} 0\n`;
        }
        for (const [key, value] of this.values) {
            const suffix = key ? `{${key}}` : '';
            out += `${this.name}${suffix} ${value}\n`;
        }
        return out;
    }
}

class Gauge {
    private values: Map<string, number> = new Map();
    constructor(public readonly name: string, public readonly help: string, public readonly labelNames: string[] = []) {}
    set(val: number, labels?: Record<string, string>): void { this.values.set(labelKey(labels), val); }
    inc(by = 1, labels?: Record<string, string>): void {
        const key = labelKey(labels);
        this.values.set(key, (this.values.get(key) ?? 0) + by);
    }
    dec(by = 1, labels?: Record<string, string>): void {
        const key = labelKey(labels);
        this.values.set(key, (this.values.get(key) ?? 0) - by);
    }
    reset(): void { this.values.clear(); }
    collect(): string {
        let out = `# HELP ${this.name} ${this.help}\n# TYPE ${this.name} gauge\n`;
        if (this.values.size === 0) {
            return out + `${this.name} 0\n`;
        }
        for (const [key, value] of this.values) {
            const suffix = key ? `{${key}}` : '';
            out += `${this.name}${suffix} ${value}\n`;
        }
        return out;
    }
    raw(labels?: Record<string, string>): number { return this.values.get(labelKey(labels)) ?? 0; }
}

class Histogram {
    private buckets: number[];
    private counts: Map<string, number[]> = new Map();
    constructor(
        public readonly name: string,
        public readonly help: string,
        public readonly labelNames: string[] = [],
        opts?: { buckets?: number[] }
    ) {
        this.buckets = opts?.buckets ?? [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
    }
    observe(value: number, labels?: Record<string, string>): void {
        const key = labelKey(labels);
        if (!this.counts.has(key)) {
            this.counts.set(key, new Array(this.buckets.length + 1).fill(0));
        }
        const arr = this.counts.get(key)!;
        let idx = this.buckets.length;
        for (let i = 0; i < this.buckets.length; i++) {
            if (value <= this.buckets[i]) { idx = i; break; }
        }
        arr[idx]++;
        arr[this.buckets.length]++; // +Inf count
    }
    collect(): string {
        let out = `# HELP ${this.name} ${this.help}\n# TYPE ${this.name} histogram\n`;
        for (const [key, counts] of this.counts) {
            const suffix = key ? `{${key}}` : '';
            let cumul = 0;
            for (let i = 0; i < this.buckets.length; i++) {
                cumul += counts[i];
                out += `${this.name}_bucket${suffix}{le="${this.buckets[i]}"} ${cumul}\n`;
            }
            cumul += counts[this.buckets.length];
            out += `${this.name}_bucket${suffix}{le="+Inf"} ${cumul}\n`;
            out += `${this.name}_count${suffix} ${cumul}\n`;
        }
        return out;
    }
    reset(): void { this.counts.clear(); }
}

// ── Metric definitions ──
export const metrics = {
    // Gauge: current state
    activeCalls: new Gauge('voice_active_calls', 'Currently active voice calls'),
    activeWebsockets: new Gauge('voice_active_websockets', 'Currently connected WebSocket connections'),
    activeDeepgram: new Gauge('voice_active_deepgram', 'Active Deepgram STT connections'),
    activeOpenAI: new Gauge('voice_active_openai', 'Active OpenAI requests'),

    // Counter: cumulative events
    callsStarted: new Counter('voice_calls_started_total', 'Total voice calls started'),
    callsCompleted: new Counter('voice_calls_completed_total', 'Total voice calls completed'),
    callsFailed: new Counter('voice_calls_failed_total', 'Total voice calls failed'),
    websocketDisconnects: new Counter('voice_websocket_disconnects_total', 'WebSocket disconnects'),
    providerFailures: new Counter('voice_provider_failures_total', 'Provider failures by provider', ['provider']),
    watchdogTimeouts: new Counter('voice_watchdog_timeouts_total', 'Watchdog timeout events'),
    bargeInTotal: new Counter('voice_barge_in_total', 'Total barge-in interruptions'),

    // Histogram: latency distributions
    callDurationSeconds: new Histogram('voice_call_duration_seconds', 'Call duration in seconds', [], { buckets: [5, 10, 30, 60, 120, 300, 600, 1200] }),
    aiLatencyMs: new Histogram('voice_ai_latency_ms', 'AI response latency', [], { buckets: [100, 250, 500, 1000, 2000, 4000, 8000] }),
    ttsLatencyMs: new Histogram('voice_tts_latency_ms', 'TTS synthesis latency', [], { buckets: [100, 250, 500, 1000, 2000, 4000, 8000] }),
    sttLatencyMs: new Histogram('voice_stt_latency_ms', 'STT processing latency', [], { buckets: [5, 10, 25, 50, 100, 250, 500] }),

    // Conversational KPI
    firstPhonemeMs: new Histogram('voice_first_phoneme_ms', 'First phoneme latency (VAD→first audio frame)', [], { buckets: [100, 200, 300, 500, 700, 1000, 1500, 2000] }),
    totalTurnMs: new Histogram('voice_total_turn_ms', 'Total turn latency (VAD→last audio frame)', [], { buckets: [200, 400, 600, 1000, 1500, 2000, 3000, 5000] }),
    interChunkGapMs: new Histogram('voice_inter_chunk_gap_ms', 'Gap between consecutive sentence audio chunks', [], { buckets: [10, 20, 30, 50, 80, 120, 200, 500] }),
    fillerPlaybacks: new Counter('voice_filler_playbacks_total', 'Filler audio playback count'),
    sentenceChunksSpoken: new Counter('voice_sentence_chunks_spoken_total', 'Total sentence chunks spoken'),
    chunkFailures: new Counter('voice_chunk_failures_total', 'Failed / cancelled sentence chunks'),
    ttsSynthesisMs: new Histogram('voice_tts_synthesis_ms', 'TTS synthesis duration per sentence', [], { buckets: [50, 100, 200, 400, 800, 1500, 3000] }),

    // Cost tracking
    openaiCostUsd: new Counter('voice_openai_cost_usd_total', 'OpenAI cost in USD'),
    ttsCostUsd: new Counter('voice_tts_cost_usd_total', 'TTS cost in USD'),
    sttCostUsd: new Counter('voice_stt_cost_usd_total', 'STT cost in USD'),
    totalCostUsd: new Counter('voice_total_cost_usd_total', 'Total provider cost in USD'),
    tokensIn: new Counter('voice_tokens_in_total', 'Input tokens used'),
    tokensOut: new Counter('voice_tokens_out_total', 'Output tokens used'),
    audioSeconds: new Counter('voice_audio_seconds_total', 'Audio processing seconds'),

    // Audio quality
    audioSilencePercent: new Histogram('voice_audio_silence_percent', 'Silence percentage per call', [], { buckets: [10, 25, 50, 75, 90, 100] }),
    audioPacketGaps: new Counter('voice_audio_packet_gaps_total', 'Detected audio packet gaps'),
    audioPlaybackTruncations: new Counter('voice_audio_playback_truncations_total', 'TTS playback truncation events'),

    // ── Realtime-specific metrics ──
    activeRealtimeSessions: new Gauge('realtime_active_sessions', 'Currently active OpenAI Realtime sessions'),
    realtimeCallsStarted: new Counter('realtime_calls_started_total', 'Realtime calls started'),
    realtimeCallsCompleted: new Counter('realtime_calls_completed_total', 'Realtime calls completed'),
    realtimeCallsFailed: new Counter('realtime_calls_failed_total', 'Realtime calls failed'),
    realtimeSessionDuration: new Histogram('realtime_session_duration_seconds', 'Realtime session duration', [], { buckets: [5, 10, 30, 60, 120, 300, 600, 1200] }),

    // Zombie / orphan tracking
    zombieSessionsDetected: new Counter('realtime_zombie_sessions_total', 'Zombie WebSocket sessions detected'),
    orphanSessionsDetected: new Counter('realtime_orphan_sessions_total', 'Orphan sessions detected'),
    sessionReconnects: new Counter('realtime_session_reconnects_total', 'Session reconnection attempts'),
    heartbeatFailures: new Counter('realtime_heartbeat_failures_total', 'Failed heartbeat pings'),

    // Redis coordination
    redisCoordinatorErrors: new Counter('realtime_coordinator_redis_errors_total', 'Session coordinator Redis errors'),
    sessionLocksAcquired: new Counter('realtime_session_locks_acquired_total', 'Distributed session locks'),
    sessionLocksFailed: new Counter('realtime_session_locks_failed_total', 'Failed lock acquisitions'),
    sessionsAdopted: new Counter('realtime_sessions_adopted_total', 'Orphan sessions adopted by this node'),

    // Twilio stream metrics
    twilioStreamsStarted: new Counter('twilio_streams_started_total', 'Twilio Media Streams started'),
    twilioStreamsStopped: new Counter('twilio_streams_stopped_total', 'Twilio Media Streams stopped'),
    twilioAudioBytesIn: new Counter('twilio_audio_bytes_in_total', 'Inbound audio bytes from Twilio'),
    twilioAudioBytesOut: new Counter('twilio_audio_bytes_out_total', 'Outbound audio bytes to Twilio'),
    twilioStreamErrors: new Counter('twilio_stream_errors_total', 'Twilio stream errors'),
    twilioPacketLoss: new Counter('twilio_packet_loss_total', 'Detected Twilio media packet loss'),

    // Tool execution metrics
    toolExecutionsTotal: new Counter('realtime_tool_executions_total', 'Tool executions by tool', ['tool']),
    toolExecutionDuration: new Histogram('realtime_tool_execution_ms', 'Tool execution duration', [], { buckets: [50, 100, 200, 500, 1000, 2000, 5000, 10000] }),
    toolErrorsTotal: new Counter('realtime_tool_errors_total', 'Tool execution errors'),
    toolTimeoutsTotal: new Counter('realtime_tool_timeouts_total', 'Tool execution timeouts'),
};

export function collectPrometheusMetrics(): string {
    const lines: string[] = [];
    for (const metric of Object.values(metrics)) {
        if (metric instanceof Counter || metric instanceof Gauge || metric instanceof Histogram) {
            lines.push(metric.collect());
        }
    }
    return lines.join('\n');
}

export function resetAllMetrics(): void {
    for (const metric of Object.values(metrics)) {
        if (metric instanceof Counter) metric.reset();
        else if (metric instanceof Gauge) metric.reset();
        else if (metric instanceof Histogram) metric.reset();
    }
}
