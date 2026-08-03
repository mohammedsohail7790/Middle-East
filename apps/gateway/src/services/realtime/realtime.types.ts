export interface RealtimeSessionConfig {
  tenantId: string;
  callSid: string;
  streamSid: string;
  language: string;
  voice: string;
  instructions: string;
  tools: RealtimeTool[];
  temperature?: number;
  maxTokens?: number;
  greeting?: string;
  /** Twilio <Say> already played this greeting — skip OpenAI opening line */
  skipAiGreeting?: boolean;
  /** OpenAI Realtime audio.output.speed (0.82–1.05) */
  speechRate?: number;
}

export interface RealtimeTool {
  type: 'function';
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}

export interface RealtimeSession {
  id: string;
  tenantId: string;
  callSid: string;
  streamSid: string;
  openAiWs: any;
  twilioWs: any;
  startTime: Date;
  lastActivity: Date;
  isActive: boolean;
  config: RealtimeSessionConfig;
  nodeId?: string;
  reconnectCount?: number;
  /** Persisted on call row when session ends */
  callOutcome?: 'completed' | 'transferred' | 'failed';
  /** Greeting scheduled but not yet sent */
  greetingPending?: boolean;
  /** Greeting response.create already sent */
  greetingTriggered?: boolean;
  /** Block inbound audio + VAD until first greeting finishes */
  greetingInProgress?: boolean;
  greetingRetried?: boolean;
  /** Tools registered after first greeting (faster connect) */
  toolsDeferred?: boolean;
  /** First outbound audio frame sent to Twilio (for latency metrics) */
  firstAudioSentAt?: number;
  /** Live transcript lines for dashboard */
  transcriptLines?: { role: 'caller' | 'assistant' | 'system'; text: string }[];
}

export interface RealtimeEvent {
  type: string;
  timestamp: Date;
  sessionId: string;
  data: any;
}

export interface RealtimeMetrics {
  sessionId: string;
  tenantId: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  turnCount: number;
  interruptionCount: number;
  toolCallCount: number;
  tokensUsed: number;
  averageLatency: number;
}

export interface TwilioMediaEvent {
  event: 'media';
  streamSid: string;
  media: {
    payload: string;
    track: string;
  };
}

export interface TwilioStartEvent {
  event: 'start';
  start: {
    callSid: string;
    accountSid: string;
    streamSid: string;
    customParameters?: Record<string, string>;
  };
}

export interface TwilioStopEvent {
  event: 'stop';
}

export type TwilioWsEvent = TwilioMediaEvent | TwilioStartEvent | TwilioStopEvent;

export interface OpenAIServerEvent {
  type: string;
  [key: string]: any;
}

export interface RealtimeError {
  sessionId: string;
  type: 'connection' | 'audio' | 'tool' | 'session';
  message: string;
  timestamp: Date;
  recoverable: boolean;
}
