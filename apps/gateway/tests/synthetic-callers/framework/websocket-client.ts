/**
 * Synthetic Caller Framework - WebSocket Client
 * 
 * Simulates Twilio Media Stream WebSocket client for testing.
 * Connects to the Call IQ gateway and sends/receives audio frames.
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { AudioFrame } from './types.js';

export interface WebSocketClientConfig {
  gatewayUrl: string;
  tenantId: string;
  callSid?: string;
  streamSid?: string;
  debug?: boolean;
}

export interface TwilioStartEvent {
  event: 'start';
  sequenceNumber: string;
  start: {
    streamSid: string;
    accountSid: string;
    callSid: string;
    tracks: string[];
    mediaFormat: {
      encoding: string;
      sampleRate: number;
      channels: number;
    };
    customParameters?: Record<string, string>;
  };
  streamSid: string;
}

export interface TwilioMediaEvent {
  event: 'media';
  sequenceNumber: string;
  media: {
    track: string;
    chunk: string;
    timestamp: string;
    payload: string;
  };
  streamSid: string;
}

export interface TwilioStopEvent {
  event: 'stop';
  sequenceNumber: string;
  stop: {
    accountSid: string;
    callSid: string;
  };
  streamSid: string;
}

export class SyntheticWebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: WebSocketClientConfig;
  private callSid: string;
  private streamSid: string;
  private sequenceNumber: number = 0;
  private connected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;

  constructor(config: WebSocketClientConfig) {
    super();
    this.config = config;
    this.callSid = config.callSid || this.generateCallSid();
    this.streamSid = config.streamSid || this.generateStreamSid();
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = `${this.config.gatewayUrl}/ws/realtime/${this.config.tenantId}`;
      
      if (this.config.debug) {
        console.log(`[SyntheticCaller] Connecting to ${wsUrl}`);
      }

      this.ws = new WebSocket(wsUrl);

      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
        this.ws?.close();
      }, 10000);

      this.ws.on('open', () => {
        clearTimeout(timeout);
        this.connected = true;
        this.reconnectAttempts = 0;

        if (this.config.debug) {
          console.log(`[SyntheticCaller] Connected: ${this.callSid}`);
        }

        // Send Twilio start event
        this.sendStartEvent();
        
        this.emit('connected', { callSid: this.callSid, streamSid: this.streamSid });
        resolve();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          this.emit('error', new Error(`Failed to parse message: ${error}`));
        }
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        this.connected = false;
        
        if (this.config.debug) {
          console.log(`[SyntheticCaller] Disconnected: ${code} - ${reason.toString()}`);
        }

        this.emit('disconnected', { code, reason: reason.toString() });
      });

      this.ws.on('error', (error: Error) => {
        clearTimeout(timeout);
        this.emit('error', error);
        reject(error);
      });
    });
  }

  async disconnect(): Promise<void> {
    if (!this.ws || !this.connected) return;

    // Send Twilio stop event
    this.sendStopEvent();

    // Wait a bit for stop event to be processed
    await new Promise(resolve => setTimeout(resolve, 100));

    this.ws.close(1000, 'Test completed');
    this.connected = false;
  }

  async reconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      throw new Error('Max reconnect attempts reached');
    }

    this.reconnectAttempts++;
    
    if (this.config.debug) {
      console.log(`[SyntheticCaller] Reconnecting (attempt ${this.reconnectAttempts})...`);
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Exponential backoff
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 5000);
    await new Promise(resolve => setTimeout(resolve, delay));

    await this.connect();
  }

  sendAudio(audioFrame: AudioFrame): void {
    if (!this.ws || !this.connected) {
      throw new Error('WebSocket not connected');
    }

    const mediaEvent: TwilioMediaEvent = {
      event: 'media',
      sequenceNumber: String(this.sequenceNumber++),
      media: {
        track: 'inbound',
        chunk: String(audioFrame.sequenceNumber),
        timestamp: String(audioFrame.timestamp),
        payload: audioFrame.payload,
      },
      streamSid: this.streamSid,
    };

    this.ws.send(JSON.stringify(mediaEvent));

    if (this.config.debug) {
      console.log(`[SyntheticCaller] Sent audio frame ${audioFrame.sequenceNumber}`);
    }
  }

  private sendStartEvent(): void {
    if (!this.ws || !this.connected) return;

    const startEvent: TwilioStartEvent = {
      event: 'start',
      sequenceNumber: String(this.sequenceNumber++),
      start: {
        streamSid: this.streamSid,
        accountSid: 'AC_test_account',
        callSid: this.callSid,
        tracks: ['inbound', 'outbound'],
        mediaFormat: {
          encoding: 'audio/x-mulaw',
          sampleRate: 8000,
          channels: 1,
        },
        customParameters: {
          test: 'synthetic_caller',
        },
      },
      streamSid: this.streamSid,
    };

    this.ws.send(JSON.stringify(startEvent));

    if (this.config.debug) {
      console.log(`[SyntheticCaller] Sent start event`);
    }
  }

  private sendStopEvent(): void {
    if (!this.ws || !this.connected) return;

    const stopEvent: TwilioStopEvent = {
      event: 'stop',
      sequenceNumber: String(this.sequenceNumber++),
      stop: {
        accountSid: 'AC_test_account',
        callSid: this.callSid,
      },
      streamSid: this.streamSid,
    };

    this.ws.send(JSON.stringify(stopEvent));

    if (this.config.debug) {
      console.log(`[SyntheticCaller] Sent stop event`);
    }
  }

  private handleMessage(message: any): void {
    if (this.config.debug) {
      console.log(`[SyntheticCaller] Received:`, message.event || message.type);
    }

    // Handle different message types from OpenAI Realtime API
    switch (message.type) {
      case 'session.created':
        this.emit('session.created', message);
        break;
      
      case 'session.updated':
        this.emit('session.updated', message);
        break;
      
      case 'conversation.item.created':
        this.emit('conversation.item.created', message);
        break;
      
      case 'response.audio.delta':
        this.emit('audio.received', {
          payload: message.delta,
          timestamp: Date.now(),
        });
        break;
      
      case 'response.audio.done':
        this.emit('audio.complete', message);
        break;
      
      case 'response.done':
        this.emit('response.done', message);
        break;
      
      case 'response.function_call_arguments.done':
        this.emit('tool.called', {
          name: message.name,
          arguments: message.arguments,
          callId: message.call_id,
        });
        break;
      
      case 'error':
        this.emit('error', new Error(message.error?.message || 'Unknown error'));
        break;
      
      default:
        this.emit('message', message);
    }
  }

  private generateCallSid(): string {
    return `CA${this.randomHex(32)}`;
  }

  private generateStreamSid(): string {
    return `MZ${this.randomHex(32)}`;
  }

  private randomHex(length: number): string {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  getCallSid(): string {
    return this.callSid;
  }

  getStreamSid(): string {
    return this.streamSid;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
