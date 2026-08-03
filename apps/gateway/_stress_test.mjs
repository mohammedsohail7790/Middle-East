/**
 * Stress testing harness for the Call IQ Voice Gateway
 *
 * Usage:
 *   node _stress_test.mjs
 *
 * This script connects multiple WebSocket clients to simulate concurrent calls,
 * rapid hangups, interruption storms, silence callers, noisy audio, and reconnects.
 *
 * Environment variables:
 *   WS_URL       - WebSocket endpoint (default: ws://localhost:3003/ws/voice/test-tenant)
 *   CONCURRENCY  - Number of concurrent simulated calls (default: 10)
 *   DURATION_S   - Test duration in seconds (default: 30)
 *   RAPID_HANGUP - Enable rapid hangup testing (default: true)
 *   NOISY_AUDIO  - Enable noisy audio simulation (default: true)
 */

import WebSocket from 'ws';

const WS_URL = process.env.WS_URL || 'ws://localhost:3003/ws/voice/test-tenant';
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '10', 10);
const DURATION_S = parseInt(process.env.DURATION_S || '30', 10);
const RAPID_HANGUP = process.env.RAPID_HANGUP !== 'false';
const NOISY_AUDIO = process.env.NOISY_AUDIO !== 'false';

const TEST_STREAM_SID = 'MZ-stream-stress-test';
const CALL_SID_PREFIX = 'CA-stress-test-';

// Generate a chunk of μ-law silence (8000 samples/sec, 20ms = 160 bytes)
function generateSilenceFrame() {
    return Buffer.alloc(160, 0xff).toString('base64');
}

// Generate noisy audio frames (random μ-law-like values)
function generateNoiseFrame() {
    const buf = Buffer.alloc(160);
    for (let i = 0; i < 160; i++) {
        buf[i] = Math.floor(Math.random() * 256);
    }
    return buf.toString('base64');
}

// Generate simulated speech pattern (alternating tones)
function generateSpeechFrame() {
    const buf = Buffer.alloc(160);
    for (let i = 0; i < 160; i++) {
        buf[i] = 0x80 + Math.floor(Math.sin(i * 0.5) * 30);
    }
    return buf.toString('base64');
}

const SILENCE = generateSilenceFrame();
const NOISE = generateNoiseFrame();
const SPEECH = generateSpeechFrame();

class SimulatedCall {
    public ws;
    public callSid;
    public startTime;
    public mediaInterval = null;
    public interrupted = false;

    constructor(public index: number) {
        this.callSid = `${CALL_SID_PREFIX}${index}-${Date.now()}`;
        this.startTime = Date.now();
        this.ws = new WebSocket(`${WS_URL}?index=${index}`);
    }

    connect() {
        return new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000);

            this.ws.on('open', () => {
                clearTimeout(timeout);
                // Send start event to simulate Twilio start
                this.sendStart();
                resolve();
            });

            this.ws.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });

            this.ws.on('close', (code, reason) => {
                this.stopMedia();
            });
        });
    }

    sendStart() {
        this.ws.send(JSON.stringify({
            event: 'start',
            streamSid: TEST_STREAM_SID,
            start: {
                callSid: this.callSid,
                accountSid: 'AC-test-account',
                streamSid: TEST_STREAM_SID,
                customParameters: {
                    from: '+1555' + String(this.index).padStart(7, '0'),
                    to: '+15551234567',
                },
            },
        }));
        this.sendConnected();
    }

    sendConnected() {
        this.ws.send(JSON.stringify({ event: 'connected', streamSid: TEST_STREAM_SID }));
    }

    startMedia(pattern: 'silence' | 'noise' | 'speech' | 'interruption') {
        this.stopMedia();
        this.mediaInterval = setInterval(() => {
            if (this.ws.readyState === WebSocket.OPEN) {
                let frame: string;
                switch (pattern) {
                    case 'noise': frame = NOISE; break;
                    case 'speech': frame = SPEECH; break;
                    case 'interruption':
                        // Burst of speech followed by silence, simulating barge-in
                        frame = Math.random() > 0.7 ? SPEECH : SILENCE;
                        break;
                    default: frame = SILENCE;
                }
                this.ws.send(JSON.stringify({
                    event: 'media',
                    streamSid: TEST_STREAM_SID,
                    media: { payload: frame, track: 'inbound' },
                }));
            }
        }, 20); // Every 20ms = 50fps (real µ-law frames)
    }

    stopMedia() {
        if (this.mediaInterval) {
            clearInterval(this.mediaInterval);
            this.mediaInterval = null;
        }
    }

    sendStop() {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ event: 'stop', streamSid: TEST_STREAM_SID }));
        }
    }

    close() {
        this.stopMedia();
        try { this.ws.close(); } catch { /* ignore */ }
    }
}

async function runStressTest() {
    console.log('='.repeat(60));
    console.log('STRESS TEST — Call IQ Voice Gateway');
    console.log('='.repeat(60));
    console.log(`WS URL:       ${WS_URL}`);
    console.log(`Concurrency:  ${CONCURRENCY}`);
    console.log(`Duration:     ${DURATION_S}s`);
    console.log(`Rapid Hangup: ${RAPID_HANGUP}`);
    console.log(`Noisy Audio:  ${NOISY_AUDIO}`);
    console.log('');

    const calls = [];
    const errors = [];
    let connected = 0;
    let disconnected = 0;

    // Phase 1: Connect all calls
    console.log(`Phase 1: Connecting ${CONCURRENCY} concurrent calls...`);
    for (let i = 0; i < CONCURRENCY; i++) {
        const call = new SimulatedCall(i);
        calls.push(call);
        try {
            await call.connect();
            connected++;
            if (connected % 10 === 0) console.log(`  ${connected}/${CONCURRENCY} connected`);
        } catch (err) {
            errors.push({ index: i, phase: 'connect', error: String(err) });
        }
    }
    console.log(`Phase 1 complete: ${connected} connected, ${errors.length} errors`);

    // Phase 2: Send media patterns for a duration
    console.log(`\nPhase 2: Sending media patterns for ${DURATION_S}s...`);

    const patterns = ['silence', 'speech', 'noise', 'interruption'];
    for (const call of calls) {
        if (call.ws.readyState === WebSocket.OPEN) {
            const pattern = patterns[call.index % patterns.length];
            call.startMedia(pattern);
        }
    }

    // During this phase, simulate rapid hangups if enabled
    if (RAPID_HANGUP) {
        const hangupInterval = setInterval(() => {
            // Pick a random active call and hang it up, then reconnect
            const active = calls.filter(c => c.ws.readyState === WebSocket.OPEN);
            if (active.length > 0) {
                const target = active[Math.floor(Math.random() * active.length)];
                console.log(`  [RAPID HANGUP] Call ${target.index}`);
                target.sendStop();
                target.close();
                disconnected++;

                // Create a replacement call to maintain concurrency
                const idx = target.index;
                const newCall = new SimulatedCall(idx);
                calls[idx] = newCall;
                newCall.connect().then(() => {
                    const pattern = patterns[newCall.index % patterns.length];
                    newCall.startMedia(pattern);
                    connected++;
                }).catch(err => {
                    errors.push({ index: idx, phase: 'reconnect', error: String(err) });
                });
            }
        }, 2000); // Every 2 seconds, hang up a random call

        await new Promise(r => setTimeout(r, DURATION_S * 1000));
        clearInterval(hangupInterval);
    } else {
        await new Promise(r => setTimeout(r, DURATION_S * 1000));
    }

    // Phase 3: Tear down
    console.log(`\nPhase 3: Tearing down ${calls.length} calls...`);
    for (const call of calls) {
        call.sendStop();
        call.close();
    }

    // Wait for all cleanups
    await new Promise(r => setTimeout(r, 2000));

    // Results
    console.log('\n' + '='.repeat(60));
    console.log('RESULTS');
    console.log('='.repeat(60));
    console.log(`Total calls simulated:  ${CONCURRENCY + disconnected}`);
    console.log(`Total disconnects:      ${disconnected}`);
    console.log(`Total errors:           ${errors.length}`);
    console.log(`Duration:               ${DURATION_S}s`);
    if (errors.length > 0) {
        console.log('\nErrors:');
        for (const e of errors.slice(0, 10)) {
            console.log(`  [${e.index}] ${e.phase}: ${e.error}`);
        }
        if (errors.length > 10) {
            console.log(`  ... and ${errors.length - 10} more`);
        }
    }

    // Memory usage
    const mem = process.memoryUsage();
    console.log(`\nMemory:`);
    console.log(`  RSS:    ${Math.round(mem.rss / 1024 / 1024)} MB`);
    console.log(`  Heap:   ${Math.round(mem.heapUsed / 1024 / 1024)} MB`);
    console.log(`  External: ${Math.round(mem.external / 1024 / 1024)} MB`);

    console.log('\nStress test complete.');
}

runStressTest().catch(err => {
    console.error('Stress test failed:', err);
    process.exit(1);
});
