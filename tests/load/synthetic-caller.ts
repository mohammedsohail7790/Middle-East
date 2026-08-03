/**
 * Synthetic Caller Simulator
 * 
 * Simulates multiple concurrent Twilio WebSocket connections to test
 * the realtime voice pipeline under load.
 * 
 * Usage:
 *   npx tsx tests/load/synthetic-caller.ts --concurrent=10 --duration=60
 */

import WebSocket from 'ws';
import { randomUUID } from 'crypto';

interface SimulatedCall {
    callSid: string;
    streamSid: string;
    tenantId: string;
    socket: WebSocket;
    startTime: number;
    audioPacketsSent: number;
    audioPacketsReceived: number;
}

interface LoadTestConfig {
    concurrent: number;
    duration: number;
    tenantId: string;
    gatewayUrl: string;
    audioPacketInterval: number;
    maxCallDuration: number;
}

const DEFAULT_CONFIG: LoadTestConfig = {
    concurrent: 10,
    duration: 60,
    tenantId: 'load-test-tenant',
    gatewayUrl: 'ws://localhost:3003/ws/realtime/load-test-tenant',
    audioPacketInterval: 50,
    maxCallDuration: 120000,
};

function parseArgs(): LoadTestConfig {
    const args = process.argv.slice(2);
    const config = { ...DEFAULT_CONFIG };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--concurrent': config.concurrent = parseInt(args[++i], 10); break;
            case '--duration': config.duration = parseInt(args[++i], 10); break;
            case '--tenant': config.tenantId = args[++i]; break;
            case '--url': config.gatewayUrl = args[++i]; break;
            case '--interval': config.audioPacketInterval = parseInt(args[++i], 10); break;
            case '--max-call': config.maxCallDuration = parseInt(args[++i], 10); break;
        }
    }

    return config;
}

function generateSilentAudioFrame(): string {
    return Buffer.from(new Uint8Array(320).fill(0x00)).toString('base64');
}

function generateNoiseFrame(): string {
    const frame = new Uint8Array(320);
    for (let i = 0; i < frame.length; i++) {
        frame[i] = Math.floor(Math.random() * 60) + 130;
    }
    return Buffer.from(frame).toString('base64');
}

async function simulateCall(config: LoadTestConfig, callIndex: number): Promise<SimulatedCall> {
    const callSid = `loadtest_${callIndex}_${Date.now()}`;
    const streamSid = `stream_${callSid}`;
    const tenantId = `${config.tenantId}_${callIndex % 5}`;
    const url = config.gatewayUrl.replace(/\/[^/]+$/, `/${tenantId}`);

    return new Promise((resolve, reject) => {
        const socket = new WebSocket(url);

        const call: SimulatedCall = {
            callSid,
            streamSid,
            tenantId,
            socket,
            startTime: Date.now(),
            audioPacketsSent: 0,
            audioPacketsReceived: 0,
        };

        socket.on('open', () => {
            sendStartEvent(socket, call);
            startAudioStream(socket, call, config);
            resolve(call);
        });

        socket.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.event === 'media') {
                    call.audioPacketsReceived++;
                }
            } catch { /* ignore parse errors */ }
        });

        socket.on('error', (err) => {
            console.error(`[Call ${callIndex}] WS error:`, err.message);
        });

        socket.on('close', (code) => {
            console.log(`[Call ${callIndex}] Closed: code=${code}, sent=${call.audioPacketsSent}, recv=${call.audioPacketsReceived}`);
        });

        setTimeout(() => {
            reject(new Error(`Connection timeout for call ${callIndex}`));
        }, 10000);
    });
}

function sendStartEvent(socket: WebSocket, call: SimulatedCall): void {
    const startEvent = {
        event: 'start',
        start: {
            callSid: call.callSid,
            accountSid: 'load-test-account',
            streamSid: call.streamSid,
            customParameters: {
                tenant_id: call.tenantId,
                test_call: 'true',
            },
        },
    };
    socket.send(JSON.stringify(startEvent));
    console.log(`[Call ${call.callSid}] Start event sent`);
}

function startAudioStream(socket: WebSocket, call: SimulatedCall, config: LoadTestConfig): void {
    const interval = setInterval(() => {
        if (socket.readyState !== WebSocket.OPEN) {
            clearInterval(interval);
            return;
        }

        const audioFrame = call.audioPacketsSent % 20 === 0
            ? generateNoiseFrame()
            : generateSilentAudioFrame();

        const mediaEvent = {
            event: 'media',
            streamSid: call.streamSid,
            media: {
                payload: audioFrame,
                track: 'inbound',
            },
        };

        socket.send(JSON.stringify(mediaEvent));
        call.audioPacketsSent++;

        if (Date.now() - call.startTime > config.maxCallDuration) {
            clearInterval(interval);
            sendStopEvent(socket, call);
        }
    }, config.audioPacketInterval);
}

function sendStopEvent(socket: WebSocket, call: SimulatedCall): void {
    if (socket.readyState !== WebSocket.OPEN) return;

    socket.send(JSON.stringify({ event: 'stop' }));
    console.log(`[Call ${call.callSid}] Stop event sent`);

    setTimeout(() => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.close(1000, 'Call ended');
        }
    }, 1000);
}

async function runLoadTest(): Promise<void> {
    const config = parseArgs();

    console.log('=== Load Test Configuration ===');
    console.log(`Concurrent calls: ${config.concurrent}`);
    console.log(`Test duration: ${config.duration}s`);
    console.log(`Gateway URL: ${config.gatewayUrl}`);
    console.log(`Audio interval: ${config.audioPacketInterval}ms`);
    console.log(`Max call duration: ${config.maxCallDuration}ms`);
    console.log('');

    const allCalls: SimulatedCall[] = [];
    const startTime = Date.now();
    const testDuration = config.duration * 1000;

    console.log(`Starting ${config.concurrent} concurrent calls...`);
    console.log('');

    const launchPromises: Promise<void>[] = [];
    for (let i = 0; i < config.concurrent; i++) {
        launchPromises.push(
            simulateCall(config, i)
                .then(call => {
                    allCalls.push(call);
                    console.log(`[Call ${i}] Connected (${call.callSid})`);
                })
                .catch(err => {
                    console.error(`[Call ${i}] Failed:`, err.message);
                })
        );
    }

    await Promise.all(launchPromises);

    console.log('');
    console.log(`Connected: ${allCalls.length}/${config.concurrent} calls`);
    console.log(`Running for ${config.duration}s...`);
    console.log('');

    let totalSent = 0;
    let totalReceived = 0;
    const statsInterval = setInterval(() => {
        totalSent = allCalls.reduce((s, c) => s + c.audioPacketsSent, 0);
        totalReceived = allCalls.reduce((s, c) => s + c.audioPacketsReceived, 0);
        const active = allCalls.filter(c => c.socket.readyState === WebSocket.OPEN).length;

        const elapsed = Math.round((Date.now() - startTime) / 1000);
        const mem = process.memoryUsage();

        console.log(`[${elapsed}s] Active: ${active}/${allCalls.length} | Sent: ${totalSent} | Recv: ${totalReceived} | Mem: ${Math.round(mem.rss / 1024 / 1024)}MB`);

        if (Date.now() - startTime >= testDuration) {
            clearInterval(statsInterval);
        }
    }, 5000);

    await new Promise(resolve => setTimeout(resolve, testDuration));

    console.log('');
    console.log('=== Test Complete ===');
    console.log('');

    for (const call of allCalls) {
        sendStopEvent(call.socket, call);
    }

    await new Promise(resolve => setTimeout(resolve, 3000));

    for (const call of allCalls) {
        try { call.socket.close(1000); } catch { /* ignore */ }
    }

    const finalSent = allCalls.reduce((s, c) => s + c.audioPacketsSent, 0);
    const finalReceived = allCalls.reduce((s, c) => s + c.audioPacketsReceived, 0);
    const duration = Math.round((Date.now() - startTime) / 1000);

    console.log('');
    console.log('=== Results ===');
    console.log(`Duration: ${duration}s`);
    console.log(`Total calls initiated: ${config.concurrent}`);
    console.log(`Total calls connected: ${allCalls.length}`);
    console.log(`Audio packets sent: ${finalSent}`);
    console.log(`Audio packets received: ${finalReceived}`);
    console.log(`Packet loss (inbound): ${finalSent > 0 ? ((1 - finalReceived / finalSent) * 100).toFixed(1) : 'N/A'}%`);
    console.log(`Peak memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`);
}

runLoadTest().catch(console.error);
