/**
 * Load test for the voice WebSocket pipeline.
 *
 * Simulates multiple concurrent calls by opening WebSocket connections,
 * sending synthetic audio frames, and measuring:
 *   - connection stability
 *   - frame delivery rate
 *   - latency
 *   - memory / event loop health
 *
 * Usage:
 *   node scripts/load-test.mjs [concurrency=10] [durationSec=30] [wsUrl]
 *
 * Defaults:
 *   concurrency=10, duration=30s, wsUrl=ws://localhost:3003/ws/voice/test-tenant
 */

const CONCURRENCY = parseInt(process.argv[2] || '10', 10);
const DURATION_SEC = parseInt(process.argv[3] || '30', 10);
const WS_URL = process.argv[4] || 'ws://localhost:3003/ws/voice/test-tenant';

import WebSocket from 'ws';

// ── Metrics ──
const metrics = {
    connectionsAttempted: 0,
    connectionsOpened: 0,
    connectionsFailed: 0,
    connectionsClosed: 0,
    framesSent: 0,
    framesReceived: 0,
    marksReceived: 0,
    errors: 0,
    latencyMs: [] as number[],
    connectionTimes: [] as number[],
    frameIntervals: [] as number[],
    memSnapshots: [] as { rss: number; heapUsed: number; heapTotal: number }[],
};

// μ-law silence frame (160 bytes) — real audio payload
const SILENCE_FRAME = Buffer.alloc(160, 0xff).toString('base64');

function makeMediaPayload(streamSid: string, payload: string): string {
    return JSON.stringify({ event: 'media', streamSid, media: { payload } });
}

function makeStartPayload(streamSid: string, callSid: string): string {
    return JSON.stringify({
        event: 'start',
        streamSid,
        start: { callSid, accountSid: 'load-test', streamSid, customParameters: { from: '+15550000000', to: '+15551111111' } },
    });
}

function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

async function simulateCall(id: number): Promise<void> {
    const callSid = `load-test-call-${id}-${Date.now()}`;
    const streamSid = `stream-${id}`;
    const connectStart = Date.now();

    try {
        metrics.connectionsAttempted++;

        const ws = new WebSocket(WS_URL);
        const openPromise = new Promise<void>((resolve, reject) => {
            ws.on('open', () => {
                metrics.connectionsOpened++;
                metrics.connectionTimes.push(Date.now() - connectStart);
                resolve();
            });
            ws.on('error', (err) => {
                metrics.errors++;
                reject(err);
            });
        });

        // Wait for connection with timeout
        await Promise.race([
            openPromise,
            sleep(5000).then(() => { throw new Error('connection_timeout'); }),
        ]);

        // Send start event to simulate Twilio start
        ws.send(makeStartPayload(streamSid, callSid));

        await sleep(200);

        // Simulate audio frames for the call duration
        const endTime = Date.now() + DURATION_SEC * 1000;
        let frameCount = 0;
        let lastFrameTs = performance.now();

        while (Date.now() < endTime && ws.readyState === WebSocket.OPEN) {
            const payload = makeMediaPayload(streamSid, SILENCE_FRAME);
            ws.send(payload);
            metrics.framesSent++;
            frameCount++;

            const now = performance.now();
            metrics.frameIntervals.push(now - lastFrameTs);
            lastFrameTs = now;

            // 50fps = every 20ms
            await sleep(20);
        }

        // Send stop event
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ event: 'stop', streamSid }));
        }

        // Wait for close
        await new Promise<void>((resolve) => {
            ws.on('close', () => {
                metrics.connectionsClosed++;
                resolve();
            });
            setTimeout(() => {
                try { ws.close(); } catch {}
                resolve();
            }, 3000);
        });

    } catch (err) {
        metrics.connectionsFailed++;
        metrics.errors++;
        // console.error(`Call ${id} failed:`, err.message);
    }
}

// ── Memory sampler ──
function startMemorySampler(): void {
    setInterval(() => {
        const mem = process.memoryUsage();
        metrics.memSnapshots.push({
            rss: Math.round(mem.rss / 1024 / 1024),
            heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
            heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
        });
    }, 1000);
}

// ── Main ──
async function main() {
    console.log(`\n=== Load Test ===`);
    console.log(`Concurrency: ${CONCURRENCY}`);
    console.log(`Duration: ${DURATION_SEC}s`);
    console.log(`WebSocket URL: ${WS_URL}`);
    console.log(`\nStarting...\n`);

    startMemorySampler();

    const startTime = Date.now();

    // Launch all concurrent calls
    const promises = [];
    for (let i = 0; i < CONCURRENCY; i++) {
        promises.push(simulateCall(i));
        // Stagger starts by 10ms to avoid thundering herd
        await sleep(10);
    }

    await Promise.allSettled(promises);

    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

    // ── Report ──
    const avgLatency = metrics.connectionTimes.length > 0
        ? Math.round(metrics.connectionTimes.reduce((a, b) => a + b, 0) / metrics.connectionTimes.length)
        : 0;
    const avgInterval = metrics.frameIntervals.length > 0
        ? Math.round((metrics.frameIntervals.reduce((a, b) => a + b, 0) / metrics.frameIntervals.length) * 10) / 10
        : 0;
    const memAvg = metrics.memSnapshots.length > 0
        ? Math.round(metrics.memSnapshots.reduce((a, m) => a + m.heapUsed, 0) / metrics.memSnapshots.length)
        : 0;
    const memPeak = metrics.memSnapshots.length > 0
        ? Math.max(...metrics.memSnapshots.map(m => m.heapUsed))
        : 0;

    console.log(`\n=== Results (${elapsedSec}s) ===`);
    console.log(`Connections:`);
    console.log(`  Attempted: ${metrics.connectionsAttempted}`);
    console.log(`  Opened:    ${metrics.connectionsOpened}`);
    console.log(`  Failed:    ${metrics.connectionsFailed}`);
    console.log(`  Closed:    ${metrics.connectionsClosed}`);
    console.log(`  Avg connect time: ${avgLatency}ms`);
    console.log(`Frames:`);
    console.log(`  Sent:      ${metrics.framesSent}`);
    console.log(`  Avg interval: ${avgInterval}ms`);
    console.log(`Memory:`);
    console.log(`  Avg heap:  ${memAvg}MB`);
    console.log(`  Peak heap: ${memPeak}MB`);
    console.log(`Errors: ${metrics.errors}`);
    console.log(`\n=== Done ===\n`);
}

main().catch(console.error);
