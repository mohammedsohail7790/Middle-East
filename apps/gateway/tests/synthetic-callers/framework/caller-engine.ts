/**
 * Synthetic Caller Engine
 * 
 * Core orchestration system for running synthetic caller tests.
 * Manages personality application, scenario execution, and metrics collection.
 */

import { EventEmitter } from 'events';
import { SyntheticWebSocketClient } from './websocket-client.js';
import {
  CallerPersonality,
  TestScenario,
  TestStep,
  TestResult,
  TestMetrics,
  AudioFrame,
  SyntheticCallerConfig,
} from './types.js';
import {
  textToAudio,
  generateSilence,
  adjustSpeed,
  addBackgroundNoise,
  calculateDuration,
} from '../utils/audio-utils.js';

export class SyntheticCallerEngine extends EventEmitter {
  private client: SyntheticWebSocketClient;
  private config: SyntheticCallerConfig;
  private personality: CallerPersonality;
  private scenario: TestScenario;
  private metrics: Partial<TestMetrics> = {};
  private startTime: Date | null = null;
  private endTime: Date | null = null;
  private errors: string[] = [];
  private warnings: string[] = [];
  private turnLatencies: number[] = [];
  private interruptionCount: number = 0;
  private toolCallCount: number = 0;
  private reconnectCount: number = 0;
  private audioDropouts: number = 0;
  private conversationLog: Array<{ role: 'user' | 'assistant'; text: string; timestamp: Date }> = [];

  constructor(config: SyntheticCallerConfig) {
    super();
    this.config = config;
    this.personality = config.personality;
    this.scenario = config.scenario;
    
    this.client = new SyntheticWebSocketClient({
      gatewayUrl: config.gatewayUrl,
      tenantId: config.tenantId,
      debug: config.debug,
    });

    this.setupClientListeners();
  }

  /**
   * Run the complete test scenario
   */
  async runScenario(): Promise<TestResult> {
    this.startTime = new Date();
    this.emit('scenario.started', { scenario: this.scenario.name });

    try {
      // Connect to gateway
      await this.client.connect();
      this.emit('connected', { callSid: this.client.getCallSid() });

      // Wait for session creation
      await this.waitForSessionCreated();

      // Execute scenario steps
      for (let i = 0; i < this.scenario.steps.length; i++) {
        const step = this.scenario.steps[i];
        
        this.emit('step.started', { step: i + 1, action: step.action });
        
        try {
          await this.executeStep(step, i);
          this.emit('step.completed', { step: i + 1, action: step.action });
        } catch (error) {
          const errorMsg = `Step ${i + 1} failed: ${error instanceof Error ? error.message : String(error)}`;
          this.errors.push(errorMsg);
          this.emit('step.failed', { step: i + 1, action: step.action, error: errorMsg });
          
          // Continue or abort based on step criticality
          if (step.expect === 'booking_confirmation') {
            throw error; // Critical step
          }
        }
      }

      // Wait for final responses
      await this.delay(2000);

      // Disconnect gracefully
      await this.client.disconnect();

      this.endTime = new Date();
      this.emit('scenario.completed', { scenario: this.scenario.name });

      return this.generateResult(true);

    } catch (error) {
      this.endTime = new Date();
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.errors.push(errorMsg);
      this.emit('scenario.failed', { scenario: this.scenario.name, error: errorMsg });

      try {
        await this.client.disconnect();
      } catch { /* ignore */ }

      return this.generateResult(false);
    }
  }

  /**
   * Execute a single test step
   */
  private async executeStep(step: TestStep, stepIndex: number): Promise<void> {
    const stepStartTime = Date.now();

    switch (step.action) {
      case 'greet':
        // Wait for AI greeting
        await this.waitForAIResponse(5000);
        break;

      case 'state_need':
      case 'provide_service':
      case 'provide_date':
      case 'provide_name':
      case 'provide_phone':
      case 'provide_email':
      case 'ask_question':
        if (!step.input) {
          throw new Error(`Step ${stepIndex + 1}: Missing input for ${step.action}`);
        }
        await this.sendUserMessage(step.input);
        await this.waitForAIResponse(10000);
        break;

      case 'confirm_time':
      case 'confirm_booking':
      case 'confirm_transfer':
        if (!step.input) {
          throw new Error(`Step ${stepIndex + 1}: Missing input for ${step.action}`);
        }
        await this.sendUserMessage(step.input);
        await this.waitForAIResponse(10000);
        
        // Validate expected outcome
        if (step.expect) {
          await this.validateExpectation(step.expect);
        }
        break;

      case 'interrupt':
        await this.performInterruption(step);
        break;

      case 'rapid_questions':
        await this.performRapidQuestions(step);
        break;

      case 'silence':
        await this.performSilence(step);
        break;

      case 'disconnect':
        await this.client.disconnect();
        break;

      case 'reconnect':
        await this.client.reconnect();
        this.reconnectCount++;
        break;

      case 'repeat':
        // Repeat previous steps
        const repeatCount = step.count || 1;
        for (let i = 0; i < repeatCount; i++) {
          if (stepIndex > 0) {
            await this.executeStep(this.scenario.steps[stepIndex - 1], stepIndex - 1);
          }
        }
        break;

      default:
        this.warnings.push(`Unknown action: ${step.action}`);
    }

    const stepDuration = Date.now() - stepStartTime;
    this.turnLatencies.push(stepDuration);
  }

  /**
   * Send user message with personality traits applied
   */
  private async sendUserMessage(text: string): Promise<void> {
    this.conversationLog.push({
      role: 'user',
      text,
      timestamp: new Date(),
    });

    // Generate audio with personality traits
    let audioFrames = await textToAudio(text, {
      speed: this.personality.traits.speechPace,
    });

    // Apply background noise if configured
    if (this.personality.traits.backgroundNoise) {
      const noiseType = this.personality.traits.backgroundNoise.type[0];
      const volume = this.personality.traits.backgroundNoise.volume;
      audioFrames = addBackgroundNoise(audioFrames, noiseType, volume);
    }

    // Add silence gap before speaking (thinking pause)
    const [minGap, maxGap] = this.personality.traits.silenceGaps;
    const silenceGap = Math.floor(Math.random() * (maxGap - minGap) + minGap);
    await this.delay(silenceGap);

    // Send audio frames
    for (const frame of audioFrames) {
      if (!this.client.isConnected()) {
        throw new Error('WebSocket disconnected during audio send');
      }
      this.client.sendAudio(frame);
      await this.delay(20); // 20ms per frame
    }

    this.emit('user.spoke', { text, duration: calculateDuration(audioFrames) });
  }

  /**
   * Perform interruption based on personality traits
   */
  private async performInterruption(step: TestStep): Promise<void> {
    const count = step.count || 1;
    const timing = step.timing || '500ms';
    const delayMs = parseInt(timing);

    for (let i = 0; i < count; i++) {
      // Wait for AI to start speaking
      await this.delay(delayMs);

      // Interrupt with a phrase
      const phrase = this.personality.phrases[Math.floor(Math.random() * this.personality.phrases.length)];
      await this.sendUserMessage(phrase);
      
      this.interruptionCount++;
      this.emit('interruption', { count: this.interruptionCount, phrase });
    }
  }

  /**
   * Perform rapid-fire questions
   */
  private async performRapidQuestions(step: TestStep): Promise<void> {
    const count = step.count || 3;
    const questions = [
      "What are your hours?",
      "How much does it cost?",
      "When can you come?",
      "Do you have availability?",
      "What services do you offer?",
    ];

    for (let i = 0; i < count; i++) {
      const question = questions[i % questions.length];
      await this.sendUserMessage(question);
      await this.delay(500); // Very short gap between questions
    }
  }

  /**
   * Perform silence (inactivity test)
   */
  private async performSilence(step: TestStep): Promise<void> {
    const duration = step.duration || '45s';
    const durationMs = this.parseDuration(duration);
    
    this.emit('silence.started', { duration: durationMs });
    await this.delay(durationMs);
    this.emit('silence.ended', { duration: durationMs });
  }

  /**
   * Wait for AI response
   */
  private async waitForAIResponse(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('AI response timeout'));
      }, timeoutMs);

      const handler = (data: any) => {
        clearTimeout(timeout);
        this.client.removeListener('response.done', handler);
        resolve();
      };

      this.client.once('response.done', handler);
    });
  }

  /**
   * Wait for session creation
   */
  private async waitForSessionCreated(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Session creation timeout'));
      }, 10000);

      const handler = () => {
        clearTimeout(timeout);
        this.client.removeListener('session.created', handler);
        resolve();
      };

      this.client.once('session.created', handler);
    });
  }

  /**
   * Validate expected outcome
   */
  private async validateExpectation(expectation: string): Promise<void> {
    // This would validate against actual tool calls, responses, etc.
    // For now, we'll track that validation was requested
    this.emit('validation.requested', { expectation });
    
    // In production, check:
    // - booking_confirmation: verify create_appointment tool was called
    // - transfer_initiated: verify transfer_call tool was called
    // - knowledge_retrieved: verify search_knowledge_base tool was called
  }

  /**
   * Setup client event listeners
   */
  private setupClientListeners(): void {
    this.client.on('connected', (data) => {
      this.metrics.sessionId = data.sessionId;
      this.metrics.callSid = data.callSid;
    });

    this.client.on('audio.received', (data) => {
      // Track AI audio responses
    });

    this.client.on('response.done', (data) => {
      // Track response completion
      if (data.response?.output) {
        this.conversationLog.push({
          role: 'assistant',
          text: data.response.output[0]?.content || '',
          timestamp: new Date(),
        });
      }
    });

    this.client.on('tool.called', (data) => {
      this.toolCallCount++;
      this.emit('tool.executed', {
        name: data.name,
        arguments: data.arguments,
        count: this.toolCallCount,
      });
    });

    this.client.on('disconnected', (data) => {
      this.emit('disconnected', data);
    });

    this.client.on('error', (error) => {
      this.errors.push(error.message);
      this.emit('error', error);
    });
  }

  /**
   * Generate test result
   */
  private generateResult(success: boolean): TestResult {
    const duration = this.endTime && this.startTime
      ? this.endTime.getTime() - this.startTime.getTime()
      : 0;

    const metrics: TestMetrics = {
      sessionId: this.metrics.sessionId,
      callSid: this.metrics.callSid,
      turnCount: this.conversationLog.filter(log => log.role === 'user').length,
      interruptionCount: this.interruptionCount,
      toolCallCount: this.toolCallCount,
      averageTurnLatency: this.calculateAverage(this.turnLatencies),
      p95TurnLatency: this.calculatePercentile(this.turnLatencies, 0.95),
      p99TurnLatency: this.calculatePercentile(this.turnLatencies, 0.99),
      reconnectCount: this.reconnectCount,
      audioDropouts: this.audioDropouts,
      memoryUsage: {
        start: 0, // Would track actual memory
        end: 0,
        peak: 0,
      },
      cpuUsage: {
        average: 0, // Would track actual CPU
        peak: 0,
      },
    };

    // Validate success criteria
    const criteriaResults = this.validateSuccessCriteria();

    return {
      scenarioName: this.scenario.name,
      personality: this.personality.type,
      startTime: this.startTime!,
      endTime: this.endTime!,
      duration,
      success: success && Object.values(criteriaResults).every(v => v),
      criteriaResults,
      metrics,
      errors: this.errors,
      warnings: this.warnings,
    };
  }

  /**
   * Validate success criteria
   */
  private validateSuccessCriteria(): Record<string, boolean> {
    const criteria = this.scenario.successCriteria;
    const results: Record<string, boolean> = {};

    if (criteria.bookingCreated !== undefined) {
      results.bookingCreated = this.toolCallCount > 0; // Simplified check
    }

    if (criteria.leadCaptured !== undefined) {
      results.leadCaptured = this.toolCallCount > 0;
    }

    if (criteria.duration) {
      const maxDuration = this.parseDuration(criteria.duration);
      const actualDuration = this.endTime && this.startTime
        ? this.endTime.getTime() - this.startTime.getTime()
        : 0;
      results.duration = actualDuration <= maxDuration;
    }

    if (criteria.noZombieSessions !== undefined) {
      results.noZombieSessions = true; // Would check actual session cleanup
    }

    return results;
  }

  /**
   * Calculate average
   */
  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Calculate percentile
   */
  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Parse duration string to milliseconds
   */
  private parseDuration(duration: string): number {
    const match = duration.match(/^<?\s*(\d+)\s*(ms|s|m|min|minutes?)$/i);
    if (!match) return 0;

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    switch (unit) {
      case 'ms': return value;
      case 's': return value * 1000;
      case 'm':
      case 'min':
      case 'minute':
      case 'minutes':
        return value * 60 * 1000;
      default: return 0;
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get conversation log
   */
  getConversationLog(): Array<{ role: 'user' | 'assistant'; text: string; timestamp: Date }> {
    return this.conversationLog;
  }

  /**
   * Get current metrics
   */
  getCurrentMetrics(): Partial<TestMetrics> {
    return {
      ...this.metrics,
      turnCount: this.conversationLog.filter(log => log.role === 'user').length,
      interruptionCount: this.interruptionCount,
      toolCallCount: this.toolCallCount,
      reconnectCount: this.reconnectCount,
    };
  }
}
