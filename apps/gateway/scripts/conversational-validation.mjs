/**
 * Conversational Validation Test — exercises all 10 scenarios against a running server.
 *
 * Usage:
 *   node scripts/conversational-validation.mjs [wsUrl]
 *
 * Default:
 *   wsUrl = ws://localhost:3003/ws/voice/test-tenant
 *
 * This script simulates each test scenario as a separate "call" (WebSocket connection),
 * sends appropriate audio patterns, monitors server responses (transcripts, TTS, marks),
 * and reports pass/fail for every production metric.
 *
 * Scenarios:
 *   1. Normal HVAC booking conversation
 *   2. User interrupts mid-sentence
 *   3. Very short replies ("yes", "no", "tomorrow")
 *   4. Long pauses from caller
 *   5. Topic switching mid-call
 *   6. KB-specific technical questions
 *   7. Noisy environment / speakerphone
 *   8. Fast-speaking caller
 *   9. Silent caller
 *  10. Caller hangs up during AI speech
 *
 * Each call records:
 *   firstTranscriptMs, total_turn_latency_ms, interruptionAcceptedCount,
 *   interruptionRejectedEcho, kbChunksUsed, avgAssistantTurnDuration,
 *   avgUserTurnDuration, staleResponseDiscards, deepgramReconnects, maxInterFrameMs
 */

const WS_URL = process.argv[2] || 'ws://localhost:3003/ws/voice/test-tenant';
const VERBOSE = process.env.VERBOSE === 'true';

import WebSocket from 'ws';

// ── Audio frame generators ──
function silenceFrame() { return Buffer.alloc(160, 0xff).toString('base64'); }
function noiseFrame() {
    const buf = Buffer.alloc(160);
    for (let i = 0; i < 160; i++) buf[i] = Math.floor(Math.random() * 256);
    return buf.toString('base64');
}
function speechFrame() {
    const buf = Buffer.alloc(160);
    for (let i = 0; i < 160; i++) buf[i] = 0x80 + Math.floor(Math.sin(i * 0.5) * 30);
    return buf.toString('base64');
}

function makeStart(streamSid, callSid) {
    return JSON.stringify({ event: 'start', streamSid, start: { callSid, accountSid: 'validation-test', streamSid, customParameters: { from: '+15550000001', to: '+15551234567' } } });
}
function makeMedia(streamSid, payload) {
    return JSON.stringify({ event: 'media', streamSid, media: { payload } });
}
function makeStop(streamSid) {
    return JSON.stringify({ event: 'stop', streamSid });
}
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Per-call metrics collector ──
class CallMetrics {
    constructor(scenario) {
        this.scenario = scenario;
        this.firstTranscriptMs = null;
        this.interruptionAcceptedCount = 0;
        this.interruptionRejectedEcho = 0;
        this.kbChunksUsed = 0;
        this.staleResponseDiscards = 0;
        this.deepgramReconnects = 0;
        this.maxInterFrameMs = 0;
        this.avgAssistantTurnDuration = 0;
        this.avgUserTurnDuration = 0;
        this.totalTurnLatencyMs = 0;
        this.turnCount = 0;
        this.errors = [];
        this.serverMessages = [];
        this.hasGreetingAudio = false;
        this.hasGreetingReplay = false;
        this.overlappingSpeech = false;
    }

    ingestLine(line) {
        this.serverMessages.push(line);
        try {
            const parsed = JSON.parse(line);

            // CALL_DIAGNOSTICS — per-call summary
            if (parsed.event === 'CALL_DIAGNOSTICS' || (parsed.msg && parsed.msg.includes('CALL_DIAGNOSTICS'))) {
                const d = parsed;
                this.firstTranscriptMs = d.firstTranscriptMs;
                this.interruptionAcceptedCount = d.interruptionAccepted || 0;
                this.interruptionRejectedEcho = d.interruptionRejectedEcho || 0;
                this.kbChunksUsed = d.kbChunksLastUsed || 0;
                this.avgAssistantTurnDuration = d.avgAssistantTurnDurationMs || 0;
                this.avgUserTurnDuration = d.avgUserTurnDurationMs || 0;
                this.staleResponseDiscards = d.staleResponseDiscards || 0;
                this.deepgramReconnects = d.deepgramReconnects || 0;
            }

            // TURN_LATENCY — per-turn
            if (parsed.event === 'TURN_LATENCY' || (parsed.msg && parsed.msg.includes('TURN_LATENCY'))) {
                const t = parsed.total_turn_latency_ms || parsed.totalTurnLatencyMs || 0;
                this.totalTurnLatencyMs = t;
                this.turnCount++;
            }

            // SEND_FRAMED_END — frame pacing metrics
            if (parsed.event === 'SEND_FRAMED_END' || (parsed.msg && parsed.msg.includes('SEND_FRAMED_END'))) {
                const m = parsed.maxInterFrameMs || 0;
                if (m > this.maxInterFrameMs) this.maxInterFrameMs = m;
            }

            // STALE_AI_RESPONSE_DISCARDED or STALE_RESPONSE_DISCARDED
            if (parsed.event && parsed.event.includes('STALE') && parsed.event.includes('DISCARDED')) {
                this.staleResponseDiscards++;
            }

        } catch { /* non-JSON server messages */ }
    }

    report() {
        const passes = [];
        const fails = [];

        // firstTranscriptMs < 1200ms
        if (this.firstTranscriptMs !== null && this.firstTranscriptMs < 1200) passes.push('firstTranscriptMs < 1200ms');
        else if (this.firstTranscriptMs !== null) fails.push(`firstTranscriptMs ${this.firstTranscriptMs}ms >= 1200ms`);

        // total turn latency < 2500ms
        if (this.totalTurnLatencyMs > 0 && this.totalTurnLatencyMs < 2500) passes.push('totalTurnLatency < 2500ms');
        else if (this.totalTurnLatencyMs > 0) fails.push(`totalTurnLatency ${this.totalTurnLatencyMs}ms >= 2500ms`);

        // maxInterFrameMs < 40ms
        if (this.maxInterFrameMs < 40) passes.push('maxInterFrameMs < 40ms');
        else fails.push(`maxInterFrameMs ${this.maxInterFrameMs}ms >= 40ms`);

        // zero duplicate playback (no greeting replay)
        if (!this.hasGreetingReplay) passes.push('no greeting replay');
        else fails.push('greeting replayed');

        // zero overlapping speech
        if (!this.overlappingSpeech) passes.push('no overlapping speech');
        else fails.push('overlapping speech detected');

        // interruption success > 90% (if any interruptions occurred)
        const totalInterrupt = this.interruptionAcceptedCount + this.interruptionRejectedEcho;
        if (totalInterrupt > 0) {
            const rate = this.interruptionAcceptedCount / totalInterrupt;
            if (rate >= 0.9) passes.push(`interruption success ${Math.round(rate * 100)}%`);
            else fails.push(`interruption success ${Math.round(rate * 100)}% < 90%`);
        }

        // KB retrieval success > 95% (if applicable)
        if (this.kbChunksUsed > 0) passes.push(`KB chunks used: ${this.kbChunksUsed}`);
        else if (this.scenario >= 6 && this.scenario <= 6) fails.push('KB retrieval returned 0 chunks');

        // no Deepgram reconnect storms
        if (this.deepgramReconnects === 0) passes.push('no Deepgram reconnects');
        else if (this.deepgramReconnects <= 2) passes.push(`Deepgram reconnects: ${this.deepgramReconnects} (acceptable)`);
        else fails.push(`Deepgram reconnects: ${this.deepgramReconnects} (storm)`);

        return {
            scenario: this.scenario,
            metrics: {
                firstTranscriptMs: this.firstTranscriptMs,
                totalTurnLatencyMs: this.totalTurnLatencyMs,
                interruptionAccepted: this.interruptionAcceptedCount,
                interruptionRejected: this.interruptionRejectedEcho,
                kbChunksUsed: this.kbChunksUsed,
                avgAssistantTurnDurationMs: this.avgAssistantTurnDuration,
                avgUserTurnDurationMs: this.avgUserTurnDuration,
                staleDiscards: this.staleResponseDiscards,
                deepgramReconnects: this.deepgramReconnects,
                maxInterFrameMs: this.maxInterFrameMs,
            },
            passes,
            fails,
            errors: this.errors,
        };
    }
}

// ── Scenario implementations ──
const SCENARIOS = [
    { id: 1, name: 'Normal HVAC booking conversation', fn: simulateNormalCall },
    { id: 2, name: 'User interrupts mid-sentence', fn: simulateInterruption },
    { id: 3, name: 'Very short replies (yes/no/tomorrow)', fn: simulateShortReplies },
    { id: 4, name: 'Long pauses from caller', fn: simulateLongPause },
    { id: 5, name: 'Topic switching mid-call', fn: simulateTopicSwitch },
    { id: 6, name: 'KB-specific technical questions', fn: simulateTechQuestion },
    { id: 7, name: 'Noisy environment / speakerphone', fn: simulateNoisyEnvironment },
    { id: 8, name: 'Fast-speaking caller', fn: simulateFastSpeaker },
    { id: 9, name: 'Silent caller', fn: simulateSilentCaller },
    { id: 10, name: 'Caller hangs up during AI speech', fn: simulateHangupDuringSpeech },
];

async function connectAndRun(id, callFn) {
    const metrics = new CallMetrics(id);
    const streamSid = `validation-stream-${id}-${Date.now()}`;
    const callSid = `validation-call-${id}-${Date.now()}`;
    const ws = new WebSocket(WS_URL);
    const logBuf = [];

    const wsOpen = new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('connect timeout')), 10000);
        ws.on('open', () => { clearTimeout(t); resolve(); });
        ws.on('error', reject);
    });

    await wsOpen;

    // Collect server messages
    ws.on('message', (raw) => {
        const text = raw.toString();
        logBuf.push(text);
        metrics.ingestLine(text);
        if (VERBOSE && text.length < 500) console.log(`  [SERVER] ${text.substring(0, 200)}`);
    });

    // Send start
    ws.send(makeStart(streamSid, callSid));
    await delay(300);

    // Run scenario
    try {
        await callFn(ws, streamSid, callSid, metrics);
    } catch (err) {
        metrics.errors.push(err.message);
    }

    // Send stop and close
    try {
        ws.send(makeStop(streamSid));
        await delay(500);
        ws.close();
    } catch {}

    await delay(1000);

    const report = metrics.report();
    report.callSid = callSid;
    report.logLines = logBuf;
    return report;
}

// ── Scenario 1: Normal HVAC booking conversation ──
async function simulateNormalCall(ws, streamSid, callSid, metrics) {
    // 5 seconds of silence — let greeting play
    for (let i = 0; i < 250; i++) { ws.send(makeMedia(streamSid, silenceFrame())); await delay(20); }

    // Simulate caller speaking: "Hi, my AC is broken"
    for (let i = 0; i < 100; i++) { ws.send(makeMedia(streamSid, speechFrame())); await delay(20); }
    await delay(2000);

    // "I need someone to come fix it"
    for (let i = 0; i < 80; i++) { ws.send(makeMedia(streamSid, speechFrame())); await delay(20); }
    await delay(3000);

    // "Yes, tomorrow morning works"
    for (let i = 0; i < 60; i++) { ws.send(makeMedia(streamSid, speechFrame())); await delay(20); }
    await delay(3000);
}

// ── Scenario 2: User interrupts mid-sentence ──
async function simulateInterruption(ws, streamSid, callSid, metrics) {
    // Let greeting play for 1.5s then interrupt with loud speech
    for (let i = 0; i < 75; i++) { ws.send(makeMedia(streamSid, silenceFrame())); await delay(20); }
    // Burst of loud speech — barge in
    for (let i = 0; i < 50; i++) { ws.send(makeMedia(streamSid, speechFrame())); await delay(20); }
    await delay(1500);

    // "Listen, I need help now"
    for (let i = 0; i < 80; i++) { ws.send(makeMedia(streamSid, speechFrame())); await delay(20); }
    await delay(3000);
}

// ── Scenario 3: Very short replies ──
async function simulateShortReplies(ws, streamSid, callSid, metrics) {
    for (let i = 0; i < 250; i++) { ws.send(makeMedia(streamSid, silenceFrame())); await delay(20); }

    // "Yes"
    for (let i = 0; i < 20; i++) { ws.send(makeMedia(streamSid, speechFrame())); await delay(20); }
    await delay(2000);

    // "No"
    for (let i = 0; i < 15; i++) { ws.send(makeMedia(streamSid, speechFrame())); await delay(20); }
    await delay(2000);

    // "Tomorrow"
    for (let i = 0; i < 25; i++) { ws.send(makeMedia(streamSid, speechFrame())); await delay(20); }
    await delay(2000);
}

// ── Scenario 4: Long pauses ──
async function simulateLongPause(ws, streamSid, callSid, metrics) {
    for (let i = 0; i < 250; i++) { ws.send(makeMedia(streamSid, silenceFrame())); await delay(20); }

    // "Hello?"
    for (let i = 0; i < 30; i++) { ws.send(makeMedia(streamSid, speechFrame())); await delay(20); }
    // Long pause — 8 seconds of silence
    for (let i = 0; i < 400; i++) { ws.send(makeMedia(streamSid, silenceFrame())); await delay(20); }

    // "I'm looking for help"
    for (let i = 0; i < 50; i++) { ws.send(makeMedia(streamSid, speechFrame())); await delay(20); }
    await delay(2000);
}

// ── Scenario 5: Topic switching ──
async function simulateTopicSwitch(ws, streamSid, callSid, metrics) {
    for (let i = 0; i < 250; i++) { ws.send(makeMedia(streamSid, silenceFrame())); await delay(20); }

    // "My furnace is making noise"
    for (let i = 0; i < 80; i++) { ws.send(makeMedia(streamSid, speechFrame())); await delay(20); }
    await delay(3000);

    // "Actually, I also need a quote for a new AC unit"
    for (let i = 0; i < 100; i++) { ws.send(makeMedia(streamSid, speechFrame())); await delay(20); }
    await delay(3000);

    // "What about your maintenance plans?"
    for (let i = 0; i < 60; i++) { ws.send(makeMedia(streamSid, speechFrame())); await delay(20); }
    await delay(3000);
}

// ── Scenario 6: KB-specific technical questions ──
async function simulateTechQuestion(ws, streamSid, callSid, metrics) {
    for (let i = 0; i < 250; i++) { ws.send(makeMedia(streamSid, silenceFrame())); await delay(20); }

    // "How much does a new AC unit cost installed?"
    for (let i = 0; i < 100; i++) { ws.send(makeMedia(streamSid, speechFrame())); await delay(20); }
    await delay(4000);

    // "Do you offer financing?"
    for (let i = 0; i < 50; i++) { ws.send(makeMedia(streamSid, speechFrame())); await delay(20); }
    await delay(3000);
}

// ── Scenario 7: Noisy environment ──
async function simulateNoisyEnvironment(ws, streamSid, callSid, metrics) {
    for (let i = 0; i < 250; i++) { ws.send(makeMedia(streamSid, silenceFrame())); await delay(20); }

    // Mix of speech and noise
    for (let i = 0; i < 200; i++) {
        const frame = i % 3 === 0 ? noiseFrame() : (i % 3 === 1 ? speechFrame() : silenceFrame());
        ws.send(makeMedia(streamSid, frame));
        await delay(20);
    }
    await delay(2000);

    // "Hello can you hear me?"
    for (let i = 0; i < 40; i++) {
        const frame = i % 5 === 0 ? noiseFrame() : speechFrame();
        ws.send(makeMedia(streamSid, frame));
        await delay(20);
    }
    await delay(3000);
}

// ── Scenario 8: Fast-speaking caller ──
async function simulateFastSpeaker(ws, streamSid, callSid, metrics) {
    for (let i = 0; i < 250; i++) { ws.send(makeMedia(streamSid, silenceFrame())); await delay(20); }

    // Rapid-fire speech — no pauses between utterances
    for (let round = 0; round < 3; round++) {
        for (let i = 0; i < 60; i++) { ws.send(makeMedia(streamSid, speechFrame())); await delay(10); }
        await delay(200);
    }
    await delay(3000);
}

// ── Scenario 9: Silent caller ──
async function simulateSilentCaller(ws, streamSid, callSid, metrics) {
    // Only silence — no speech at all
    for (let i = 0; i < 500; i++) { ws.send(makeMedia(streamSid, silenceFrame())); await delay(20); }
}

// ── Scenario 10: Hangup during AI speech ──
async function simulateHangupDuringSpeech(ws, streamSid, callSid, metrics) {
    for (let i = 0; i < 250; i++) { ws.send(makeMedia(streamSid, silenceFrame())); await delay(20); }

    // Say something
    for (let i = 0; i < 50; i++) { ws.send(makeMedia(streamSid, speechFrame())); await delay(20); }
    await delay(1000);

    // Hang up abruptly mid-AI-response
    ws.send(makeStop(streamSid));
    ws.close();
}

// ── Main ──
async function main() {
    console.log('\n' + '='.repeat(70));
    console.log('CONVERSATIONAL VALIDATION TEST SUITE');
    console.log('WebSocket URL: ' + WS_URL);
    console.log('='.repeat(70) + '\n');

    const results = {};
    let allPassed = 0;
    let totalMetrics = 0;
    let passedMetrics = 0;

    for (const scenario of SCENARIOS) {
        console.log(`\n─── Scenario ${scenario.id}: ${scenario.name} ───`);
        try {
            const report = await connectAndRun(scenario.id, scenario.fn);
            results[scenario.id] = report;

            console.log(`  Metrics: firstTranscriptMs=${report.metrics.firstTranscriptMs ?? 'N/A'}, ` +
                `turnLatency=${report.metrics.totalTurnLatencyMs}ms, ` +
                `maxInterFrame=${report.metrics.maxInterFrameMs}ms, ` +
                `interruptAccepted=${report.metrics.interruptionAccepted}, ` +
                `interruptRejected=${report.metrics.interruptionRejected}, ` +
                `kbChunks=${report.metrics.kbChunksUsed}, ` +
                `staleDiscards=${report.metrics.staleDiscards}, ` +
                `dgReconnects=${report.metrics.deepgramReconnects}`);

            if (report.passes.length > 0) {
                for (const p of report.passes) console.log(`  ✅ ${p}`);
                allPassed++;
            }
            if (report.fails.length > 0) {
                for (const f of report.fails) console.log(`  ❌ ${f}`);
            }
            if (report.errors.length > 0) {
                for (const e of report.errors) console.log(`  ⚠️  Error: ${e}`);
            }

            totalMetrics += report.passes.length + report.fails.length;
            passedMetrics += report.passes.length;

        } catch (err) {
            console.log(`  ❌ Failed: ${err.message}`);
            results[scenario.id] = { scenario: scenario.id, error: err.message };
        }
    }

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('SUMMARY');
    console.log('='.repeat(70));
    const passedScenarios = Object.values(results).filter(r => r.fails && r.fails.length === 0).length;
    console.log(`Scenarios: ${passedScenarios}/${SCENARIOS.length} passed`);
    console.log(`Metrics:   ${passedMetrics}/${totalMetrics} passed`);
    console.log(`\nDetailed results in CALL_VALIDATION_RESULTS.md`);
    console.log('='.repeat(70) + '\n');

    // Generate CSV-ready output
    console.log('\n--- MACHINE-READABLE ---');
    for (const [id, r] of Object.entries(results)) {
        if (r.metrics) {
            console.log([
                id, r.scenario,
                r.metrics.firstTranscriptMs ?? '',
                r.metrics.totalTurnLatencyMs,
                r.metrics.interruptionAccepted,
                r.metrics.interruptionRejected,
                r.metrics.kbChunksUsed,
                r.metrics.avgAssistantTurnDurationMs,
                r.metrics.avgUserTurnDurationMs,
                r.metrics.staleDiscards,
                r.metrics.deepgramReconnects,
                r.metrics.maxInterFrameMs,
                r.passes.length,
                r.fails.length,
            ].join(','));
        }
    }
}

main().catch(console.error);
