/**
 * Load Testing Framework
 * 
 * Comprehensive load testing system for validating concurrent call capacity,
 * resource usage, and performance under stress.
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { performance } from 'perf_hooks';
import * as os from 'os';

export interface LoadTestConfig {
  gatewayUrl: string;
  tenantId: string;
  concurrentCalls: number;
  duration: number; // seconds
  rampUpTime?: number; // seconds
  callDuration?: number; // seconds per call
  audioFrameRate?: number; // frames per second
}

export interface LoadTestMetrics {
  // Connection metrics
  totalConnections: number;
  successfulConnections: number;
  failedConnections: number;
  activeConnections: number;
  
  // Performance metrics
  averageLatency: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  maxLatency: number;
  
  // Resource metrics
  cpuUsage: {
    average: number;
    peak: number;
    samples: number[];
  };
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
    external: number;
    peak: number;
  };
  eventLoopLag: {
    average: number;
    peak: number;
    samples: number[];
  };
  
  // WebSocket metrics
  websocketCount: number;
  droppedSessions: number;
  reconnects: number;
  errors: number;
  
  // Audio metrics
  audioFramesSent: number;
  audioFramesReceived: number;
  audioDropouts: number;
  
  // Timing
  startTime: Date;
  endTime: Date;
  duration: number;
  
  // Throughput
  callsPerSecond: number;
  framesPerSecond: number;
}

export interface CallMetrics {
  callId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  connectionLatency: number;
  audioFramesSent: number;
  audioFramesReceived: number;
  errors: string[];
  status: 'connecting' | 'active' | 'completed' | 'failed';
}

export class LoadTestFramework extends EventEmitter {
  private config: LoadTestConfig;
  private activeCalls: Map<string, CallMetrics> = new Map();
  private completedCalls: CallMetrics[] = [];
  private latencies: number[] = [];
  private cpuSamples: number[] = [];
  private eventLoopLagSamples: number[] = [];
  private startTime: Date | null = null;
  private endTime: Date | null = null;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private peakMemory: number = 0;
  private peakCpu: number = 0;
  private peakEventLoopLag: number = 0;

  constructor(config: LoadTestConfig) {
    super();
    this.config = config;
  }

  /**
   * Run load test
   */
  async run(): Promise<LoadTestMetrics> {
    this.startTime = new Date();
    this.emit('test.started', { config: this.config });

    // Start resource monitoring
    this.startMonitoring();

    try {
      // Ramp up connections
      await this.rampUp();

      // Sustain load
      await this.sustainLoad();

      // Ramp down
      await this.rampDown();

      this.endTime = new Date();
      this.emit('test.completed');

      return this.generateMetrics();

    } catch (error) {
      this.endTime = new Date();
      this.emit('test.failed', { error });
      throw error;
    } finally {
      this.stopMonitoring();
    }
  }

  /**
   * Ramp up connections gradually
   */
  private async rampUp(): Promise<void> {
    const rampUpTime = this.config.rampUpTime || 10;
    const targetConcurrent = this.config.concurrentCalls;
    const stepsPerSecond = 2;
    const totalSteps = rampUpTime * stepsPerSecond;
    const callsPerStep = Math.ceil(targetConcurrent / totalSteps);

    this.emit('rampup.started', { targetConcurrent, rampUpTime });

    for (let step = 0; step < totalSteps; step++) {
      const callsToStart = Math.min(callsPerStep, targetConcurrent - this.activeCalls.size);
      
      if (callsToStart > 0) {
        await this.startCalls(callsToStart);
      }

      this.emit('rampup.progress', {
        step: step + 1,
        total: totalSteps,
        activeCalls: this.activeCalls.size,
        target: targetConcurrent,
      });

      await this.delay(1000 / stepsPerSecond);
    }

    this.emit('rampup.completed', { activeCalls: this.activeCalls.size });
  }

  /**
   * Sustain load for duration
   */
  private async sustainLoad(): Promise<void> {
    const duration = this.config.duration;
    this.emit('sustain.started', { duration, activeCalls: this.activeCalls.size });

    const startTime = Date.now();
    while (Date.now() - startTime < duration * 1000) {
      // Maintain target concurrency
      const targetConcurrent = this.config.concurrentCalls;
      const currentActive = this.activeCalls.size;

      if (currentActive < targetConcurrent) {
        const deficit = targetConcurrent - currentActive;
        await this.startCalls(deficit);
      }

      this.emit('sustain.progress', {
        elapsed: Math.floor((Date.now() - startTime) / 1000),
        duration,
        activeCalls: this.activeCalls.size,
      });

      await this.delay(1000);
    }

    this.emit('sustain.completed');
  }

  /**
   * Ramp down connections
   */
  private async rampDown(): Promise<void> {
    this.emit('rampdown.started', { activeCalls: this.activeCalls.size });

    // Close all active calls
    const calls = Array.from(this.activeCalls.keys());
    for (const callId of calls) {
      const call = this.activeCalls.get(callId);
      if (call) {
        this.completeCall(callId, 'completed');
      }
    }

    this.emit('rampdown.completed');
  }

  /**
   * Start multiple calls
   */
  private async startCalls(count: number): Promise<void> {
    const promises: Promise<void>[] = [];

    for (let i = 0; i < count; i++) {
      promises.push(this.startSingleCall());
    }

    await Promise.allSettled(promises);
  }

  /**
   * Start a single call
   */
  private async startSingleCall(): Promise<void> {
    const callId = this.generateCallId();
    const startTime = performance.now();

    const callMetrics: CallMetrics = {
      callId,
      startTime,
      connectionLatency: 0,
      audioFramesSent: 0,
      audioFramesReceived: 0,
      errors: [],
      status: 'connecting',
    };

    this.activeCalls.set(callId, callMetrics);

    try {
      // Connect WebSocket
      const ws = await this.connectWebSocket();
      const connectionLatency = performance.now() - startTime;
      
      callMetrics.connectionLatency = connectionLatency;
      callMetrics.status = 'active';
      this.latencies.push(connectionLatency);

      this.emit('call.connected', { callId, latency: connectionLatency });

      // Send Twilio start event
      await this.sendTwilioStart(ws, callId);

      // Send audio frames
      this.sendAudioFrames(ws, callId, callMetrics);

      // Handle responses
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'response.audio.delta') {
            callMetrics.audioFramesReceived++;
          }
        } catch (error) {
          callMetrics.errors.push(`Parse error: ${error}`);
        }
      });

      ws.on('close', () => {
        this.completeCall(callId, 'completed');
      });

      ws.on('error', (error) => {
        callMetrics.errors.push(error.message);
        this.completeCall(callId, 'failed');
      });

    } catch (error) {
      callMetrics.errors.push(error instanceof Error ? error.message : String(error));
      callMetrics.status = 'failed';
      this.completeCall(callId, 'failed');
      this.emit('call.failed', { callId, error });
    }
  }

  /**
   * Send audio frames for a call
   */
  private async sendAudioFrames(ws: WebSocket, callId: string, metrics: CallMetrics): Promise<void> {
    const callDuration = this.config.callDuration || 30;
    const frameRate = this.config.audioFrameRate || 50; // 50 fps = 20ms frames
    const totalFrames = callDuration * frameRate;

    for (let i = 0; i < totalFrames; i++) {
      if (ws.readyState !== WebSocket.OPEN) break;

      try {
        await this.sendMediaFrame(ws, i);
        metrics.audioFramesSent++;
        await this.delay(1000 / frameRate);
      } catch (error) {
        metrics.errors.push(`Frame send error: ${error}`);
        break;
      }
    }

    // Close after sending all frames
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  }

  /**
   * Complete a call
   */
  private completeCall(callId: string, status: 'completed' | 'failed'): void {
    const call = this.activeCalls.get(callId);
    if (!call) return;

    call.endTime = performance.now();
    call.duration = call.endTime - call.startTime;
    call.status = status;

    this.activeCalls.delete(callId);
    this.completedCalls.push(call);

    this.emit('call.completed', { callId, status, duration: call.duration });
  }

  /**
   * Start resource monitoring
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      // CPU usage
      const cpuUsage = process.cpuUsage();
      const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
      this.cpuSamples.push(cpuPercent);
      this.peakCpu = Math.max(this.peakCpu, cpuPercent);

      // Memory usage
      const memUsage = process.memoryUsage();
      this.peakMemory = Math.max(this.peakMemory, memUsage.heapUsed);

      // Event loop lag
      const lagStart = performance.now();
      setImmediate(() => {
        const lag = performance.now() - lagStart;
        this.eventLoopLagSamples.push(lag);
        this.peakEventLoopLag = Math.max(this.peakEventLoopLag, lag);
      });

      this.emit('monitoring.sample', {
        cpu: cpuPercent,
        memory: memUsage,
        activeCalls: this.activeCalls.size,
      });
    }, 1000);
  }

  /**
   * Stop resource monitoring
   */
  private stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Generate comprehensive metrics
   */
  private generateMetrics(): LoadTestMetrics {
    const allCalls = [...this.completedCalls, ...Array.from(this.activeCalls.values())];
    const successfulCalls = this.completedCalls.filter(c => c.status === 'completed');
    const failedCalls = this.completedCalls.filter(c => c.status === 'failed');

    // Calculate latency percentiles
    const sortedLatencies = [...this.latencies].sort((a, b) => a - b);
    const p50Index = Math.floor(sortedLatencies.length * 0.5);
    const p95Index = Math.floor(sortedLatencies.length * 0.95);
    const p99Index = Math.floor(sortedLatencies.length * 0.99);

    const duration = this.endTime && this.startTime
      ? (this.endTime.getTime() - this.startTime.getTime()) / 1000
      : 0;

    const totalAudioFramesSent = allCalls.reduce((sum, c) => sum + c.audioFramesSent, 0);
    const totalAudioFramesReceived = allCalls.reduce((sum, c) => sum + c.audioFramesReceived, 0);

    return {
      totalConnections: allCalls.length,
      successfulConnections: successfulCalls.length,
      failedConnections: failedCalls.length,
      activeConnections: this.activeCalls.size,

      averageLatency: this.average(this.latencies),
      p50Latency: sortedLatencies[p50Index] || 0,
      p95Latency: sortedLatencies[p95Index] || 0,
      p99Latency: sortedLatencies[p99Index] || 0,
      maxLatency: Math.max(...this.latencies, 0),

      cpuUsage: {
        average: this.average(this.cpuSamples),
        peak: this.peakCpu,
        samples: this.cpuSamples,
      },

      memoryUsage: {
        ...process.memoryUsage(),
        peak: this.peakMemory,
      },

      eventLoopLag: {
        average: this.average(this.eventLoopLagSamples),
        peak: this.peakEventLoopLag,
        samples: this.eventLoopLagSamples,
      },

      websocketCount: this.activeCalls.size,
      droppedSessions: failedCalls.length,
      reconnects: 0, // Would track actual reconnects
      errors: allCalls.reduce((sum, c) => sum + c.errors.length, 0),

      audioFramesSent: totalAudioFramesSent,
      audioFramesReceived: totalAudioFramesReceived,
      audioDropouts: totalAudioFramesSent - totalAudioFramesReceived,

      startTime: this.startTime!,
      endTime: this.endTime!,
      duration,

      callsPerSecond: allCalls.length / duration,
      framesPerSecond: totalAudioFramesSent / duration,
    };
  }

  /**
   * Print metrics report
   */
  printReport(metrics: LoadTestMetrics): void {
    console.log('\n' + '='.repeat(80));
    console.log('LOAD TEST REPORT');
    console.log('='.repeat(80));
    
    console.log('\nCONNECTIONS:');
    console.log(`  Total: ${metrics.totalConnections}`);
    console.log(`  Successful: ${metrics.successfulConnections}`);
    console.log(`  Failed: ${metrics.failedConnections}`);
    console.log(`  Success Rate: ${((metrics.successfulConnections / metrics.totalConnections) * 100).toFixed(1)}%`);

    console.log('\nLATENCY:');
    console.log(`  Average: ${metrics.averageLatency.toFixed(0)}ms`);
    console.log(`  P50: ${metrics.p50Latency.toFixed(0)}ms`);
    console.log(`  P95: ${metrics.p95Latency.toFixed(0)}ms`);
    console.log(`  P99: ${metrics.p99Latency.toFixed(0)}ms`);
    console.log(`  Max: ${metrics.maxLatency.toFixed(0)}ms`);

    console.log('\nRESOURCE USAGE:');
    console.log(`  CPU Average: ${metrics.cpuUsage.average.toFixed(2)}%`);
    console.log(`  CPU Peak: ${metrics.cpuUsage.peak.toFixed(2)}%`);
    console.log(`  Memory Heap: ${(metrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(0)}MB`);
    console.log(`  Memory Peak: ${(metrics.memoryUsage.peak / 1024 / 1024).toFixed(0)}MB`);
    console.log(`  Event Loop Lag Avg: ${metrics.eventLoopLag.average.toFixed(2)}ms`);
    console.log(`  Event Loop Lag Peak: ${metrics.eventLoopLag.peak.toFixed(2)}ms`);

    console.log('\nAUDIO:');
    console.log(`  Frames Sent: ${metrics.audioFramesSent}`);
    console.log(`  Frames Received: ${metrics.audioFramesReceived}`);
    console.log(`  Dropouts: ${metrics.audioDropouts}`);

    console.log('\nTHROUGHPUT:');
    console.log(`  Duration: ${metrics.duration.toFixed(1)}s`);
    console.log(`  Calls/Second: ${metrics.callsPerSecond.toFixed(2)}`);
    console.log(`  Frames/Second: ${metrics.framesPerSecond.toFixed(0)}`);

    console.log('\n' + '='.repeat(80) + '\n');
  }

  // Helper methods
  private async connectWebSocket(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${this.config.gatewayUrl}/ws/realtime/${this.config.tenantId}`);
      
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
        ws.close();
      }, 5000);

      ws.on('open', () => {
        clearTimeout(timeout);
        resolve(ws);
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private async sendTwilioStart(ws: WebSocket, callId: string): Promise<void> {
    const startEvent = {
      event: 'start',
      sequenceNumber: '1',
      start: {
        streamSid: `MZ${this.randomHex(32)}`,
        accountSid: 'AC_test',
        callSid: callId,
        tracks: ['inbound', 'outbound'],
        mediaFormat: {
          encoding: 'audio/x-mulaw',
          sampleRate: 8000,
          channels: 1,
        },
      },
      streamSid: `MZ${this.randomHex(32)}`,
    };

    ws.send(JSON.stringify(startEvent));
  }

  private async sendMediaFrame(ws: WebSocket, sequenceNumber: number): Promise<void> {
    const buffer = Buffer.alloc(160);
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = Math.floor(Math.random() * 256);
    }

    const mediaEvent = {
      event: 'media',
      sequenceNumber: String(sequenceNumber),
      media: {
        track: 'inbound',
        chunk: String(sequenceNumber),
        timestamp: String(Date.now()),
        payload: buffer.toString('base64'),
      },
      streamSid: 'MZ_test',
    };

    ws.send(JSON.stringify(mediaEvent));
  }

  private generateCallId(): string {
    return `CA${this.randomHex(32)}`;
  }

  private randomHex(length: number): string {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Reconnect Storm Simulator
 * 
 * Simulates rapid reconnect scenarios to test session recovery
 */
export class ReconnectStormSimulator extends EventEmitter {
  private config: {
    gatewayUrl: string;
    tenantId: string;
    stormIntensity: number; // reconnects per second
    duration: number; // seconds
  };

  constructor(config: { gatewayUrl: string; tenantId: string; stormIntensity: number; duration: number }) {
    super();
    this.config = config;
  }

  async run(): Promise<{ totalReconnects: number; successfulReconnects: number; failedReconnects: number }> {
    const startTime = Date.now();
    let totalReconnects = 0;
    let successfulReconnects = 0;
    let failedReconnects = 0;

    this.emit('storm.started', { intensity: this.config.stormIntensity, duration: this.config.duration });

    while (Date.now() - startTime < this.config.duration * 1000) {
      const reconnectsThisSecond = this.config.stormIntensity;
      const promises: Promise<boolean>[] = [];

      for (let i = 0; i < reconnectsThisSecond; i++) {
        promises.push(this.attemptReconnect());
      }

      const results = await Promise.allSettled(promises);
      
      for (const result of results) {
        totalReconnects++;
        if (result.status === 'fulfilled' && result.value) {
          successfulReconnects++;
        } else {
          failedReconnects++;
        }
      }

      this.emit('storm.progress', {
        elapsed: Math.floor((Date.now() - startTime) / 1000),
        totalReconnects,
        successfulReconnects,
        failedReconnects,
      });

      await this.delay(1000);
    }

    this.emit('storm.completed', { totalReconnects, successfulReconnects, failedReconnects });

    return { totalReconnects, successfulReconnects, failedReconnects };
  }

  private async attemptReconnect(): Promise<boolean> {
    try {
      const ws = await this.connectWebSocket();
      await this.delay(100);
      ws.close();
      return true;
    } catch {
      return false;
    }
  }

  private async connectWebSocket(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${this.config.gatewayUrl}/ws/realtime/${this.config.tenantId}`);
      
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
        ws.close();
      }, 2000);

      ws.on('open', () => {
        clearTimeout(timeout);
        resolve(ws);
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Packet Loss Simulator
 * 
 * Simulates network packet loss to test audio pipeline resilience
 */
export class PacketLossSimulator extends EventEmitter {
  private config: {
    gatewayUrl: string;
    tenantId: string;
    lossRate: number; // 0.0 to 1.0 (percentage of packets to drop)
    duration: number; // seconds
  };

  constructor(config: { gatewayUrl: string; tenantId: string; lossRate: number; duration: number }) {
    super();
    this.config = config;
  }

  async run(): Promise<{ totalPackets: number; droppedPackets: number; deliveredPackets: number }> {
    const startTime = Date.now();
    let totalPackets = 0;
    let droppedPackets = 0;
    let deliveredPackets = 0;

    this.emit('simulation.started', { lossRate: this.config.lossRate, duration: this.config.duration });

    try {
      const ws = await this.connectWebSocket();
      await this.sendTwilioStart(ws);

      // Send audio frames with simulated packet loss
      const frameRate = 50; // 50 fps = 20ms frames
      const totalFrames = this.config.duration * frameRate;

      for (let i = 0; i < totalFrames; i++) {
        totalPackets++;

        // Simulate packet loss
        if (Math.random() < this.config.lossRate) {
          droppedPackets++;
          this.emit('packet.dropped', { frameNumber: i });
        } else {
          try {
            await this.sendMediaFrame(ws, i);
            deliveredPackets++;
          } catch {
            droppedPackets++;
          }
        }

        await this.delay(1000 / frameRate);
      }

      ws.close();

    } catch (error) {
      this.emit('simulation.error', { error });
    }

    this.emit('simulation.completed', { totalPackets, droppedPackets, deliveredPackets });

    return { totalPackets, droppedPackets, deliveredPackets };
  }

  private async connectWebSocket(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${this.config.gatewayUrl}/ws/realtime/${this.config.tenantId}`);
      
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
        ws.close();
      }, 5000);

      ws.on('open', () => {
        clearTimeout(timeout);
        resolve(ws);
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private async sendTwilioStart(ws: WebSocket): Promise<void> {
    const startEvent = {
      event: 'start',
      sequenceNumber: '1',
      start: {
        streamSid: `MZ${this.randomHex(32)}`,
        accountSid: 'AC_test',
        callSid: `CA${this.randomHex(32)}`,
        tracks: ['inbound', 'outbound'],
        mediaFormat: {
          encoding: 'audio/x-mulaw',
          sampleRate: 8000,
          channels: 1,
        },
      },
      streamSid: `MZ${this.randomHex(32)}`,
    };

    ws.send(JSON.stringify(startEvent));
  }

  private async sendMediaFrame(ws: WebSocket, sequenceNumber: number): Promise<void> {
    const buffer = Buffer.alloc(160);
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = Math.floor(Math.random() * 256);
    }

    const mediaEvent = {
      event: 'media',
      sequenceNumber: String(sequenceNumber),
      media: {
        track: 'inbound',
        chunk: String(sequenceNumber),
        timestamp: String(Date.now()),
        payload: buffer.toString('base64'),
      },
      streamSid: 'MZ_test',
    };

    ws.send(JSON.stringify(mediaEvent));
  }

  private randomHex(length: number): string {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Jitter Injector
 * 
 * Simulates network jitter (variable latency) to test timing resilience
 */
export class JitterInjector extends EventEmitter {
  private config: {
    gatewayUrl: string;
    tenantId: string;
    baseLatency: number; // ms
    jitterRange: number; // ms (+/-)
    duration: number; // seconds
  };

  constructor(config: { gatewayUrl: string; tenantId: string; baseLatency: number; jitterRange: number; duration: number }) {
    super();
    this.config = config;
  }

  async run(): Promise<{ averageLatency: number; minLatency: number; maxLatency: number; jitterStdDev: number }> {
    const startTime = Date.now();
    const latencies: number[] = [];

    this.emit('injection.started', { baseLatency: this.config.baseLatency, jitterRange: this.config.jitterRange });

    try {
      const ws = await this.connectWebSocket();
      await this.sendTwilioStart(ws);

      const frameRate = 50;
      const totalFrames = this.config.duration * frameRate;

      for (let i = 0; i < totalFrames; i++) {
        // Calculate jitter
        const jitter = (Math.random() * 2 - 1) * this.config.jitterRange;
        const latency = this.config.baseLatency + jitter;
        latencies.push(latency);

        // Inject delay
        await this.delay(latency);

        // Send frame
        await this.sendMediaFrame(ws, i);

        this.emit('frame.sent', { frameNumber: i, latency });
      }

      ws.close();

    } catch (error) {
      this.emit('injection.error', { error });
    }

    // Calculate statistics
    const averageLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const minLatency = Math.min(...latencies);
    const maxLatency = Math.max(...latencies);
    
    const variance = latencies.reduce((sum, lat) => sum + Math.pow(lat - averageLatency, 2), 0) / latencies.length;
    const jitterStdDev = Math.sqrt(variance);

    this.emit('injection.completed', { averageLatency, minLatency, maxLatency, jitterStdDev });

    return { averageLatency, minLatency, maxLatency, jitterStdDev };
  }

  private async connectWebSocket(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${this.config.gatewayUrl}/ws/realtime/${this.config.tenantId}`);
      
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
        ws.close();
      }, 5000);

      ws.on('open', () => {
        clearTimeout(timeout);
        resolve(ws);
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private async sendTwilioStart(ws: WebSocket): Promise<void> {
    const startEvent = {
      event: 'start',
      sequenceNumber: '1',
      start: {
        streamSid: `MZ${this.randomHex(32)}`,
        accountSid: 'AC_test',
        callSid: `CA${this.randomHex(32)}`,
        tracks: ['inbound', 'outbound'],
        mediaFormat: {
          encoding: 'audio/x-mulaw',
          sampleRate: 8000,
          channels: 1,
        },
      },
      streamSid: `MZ${this.randomHex(32)}`,
    };

    ws.send(JSON.stringify(startEvent));
  }

  private async sendMediaFrame(ws: WebSocket, sequenceNumber: number): Promise<void> {
    const buffer = Buffer.alloc(160);
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = Math.floor(Math.random() * 256);
    }

    const mediaEvent = {
      event: 'media',
      sequenceNumber: String(sequenceNumber),
      media: {
        track: 'inbound',
        chunk: String(sequenceNumber),
        timestamp: String(Date.now()),
        payload: buffer.toString('base64'),
      },
      streamSid: 'MZ_test',
    };

    ws.send(JSON.stringify(mediaEvent));
  }

  private randomHex(length: number): string {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Memory Pressure Simulator
 * 
 * Simulates memory pressure to test system behavior under resource constraints
 */
export class MemoryPressureSimulator extends EventEmitter {
  private config: {
    targetMemoryMB: number;
    duration: number; // seconds
    rampUpTime: number; // seconds
  };
  private allocatedBuffers: Buffer[] = [];

  constructor(config: { targetMemoryMB: number; duration: number; rampUpTime: number }) {
    super();
    this.config = config;
  }

  async run(): Promise<{ peakMemoryMB: number; averageMemoryMB: number; gcCount: number }> {
    const startTime = Date.now();
    const memorySamples: number[] = [];
    let gcCount = 0;

    this.emit('simulation.started', { targetMemoryMB: this.config.targetMemoryMB });

    // Monitor GC
    if (global.gc) {
      const originalGC = global.gc;
      global.gc = () => {
        gcCount++;
        this.emit('gc.triggered', { count: gcCount });
        originalGC();
      };
    }

    try {
      // Ramp up memory allocation
      const rampSteps = this.config.rampUpTime * 10; // 100ms steps
      const memoryPerStep = (this.config.targetMemoryMB * 1024 * 1024) / rampSteps;

      for (let i = 0; i < rampSteps; i++) {
        this.allocatedBuffers.push(Buffer.alloc(memoryPerStep));
        
        const memUsage = process.memoryUsage();
        const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
        memorySamples.push(heapUsedMB);

        this.emit('memory.allocated', {
          step: i + 1,
          total: rampSteps,
          heapUsedMB,
        });

        await this.delay(100);
      }

      // Sustain pressure
      const sustainTime = this.config.duration - this.config.rampUpTime;
      const sustainSamples = sustainTime * 10;

      for (let i = 0; i < sustainSamples; i++) {
        const memUsage = process.memoryUsage();
        const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
        memorySamples.push(heapUsedMB);

        this.emit('memory.sustained', { heapUsedMB });

        await this.delay(100);
      }

    } finally {
      // Cleanup
      this.allocatedBuffers = [];
      if (global.gc) {
        global.gc();
      }
    }

    const peakMemoryMB = Math.max(...memorySamples);
    const averageMemoryMB = memorySamples.reduce((a, b) => a + b, 0) / memorySamples.length;

    this.emit('simulation.completed', { peakMemoryMB, averageMemoryMB, gcCount });

    return { peakMemoryMB, averageMemoryMB, gcCount };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
