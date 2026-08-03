import WebSocket from 'ws';
import { logger } from '../logger.js';
import { RealtimeSession, RealtimeSessionConfig, RealtimeError, OpenAIServerEvent } from './realtime.types.js';
import { RealtimeToolsManager, ToolResult } from './realtime.tools.js';
import { RealtimeEventManager } from './realtime.events.js';
import { audioDiagnosticsManager } from './realtime.audio-diag.js';
import {
  appendSessionTranscript,
  extractMessageText,
} from './realtime.transcript.js';
import {
  buildGreetingSpeakInstruction,
  buildHumanRealtimePreamble,
  buildPostToolSpeakInstruction,
  clampSpeechSpeed,
  DEFAULT_REALTIME_VOICE,
} from './receptionist-voice.js';

/** Server VAD — how long the caller must be silent before the model replies */
const VAD_THRESHOLD = Number(process.env.REALTIME_VAD_THRESHOLD || '0.38');
const VAD_SILENCE_MS = Number(process.env.REALTIME_VAD_SILENCE_MS || '700');
const VAD_PREFIX_PADDING_MS = Number(process.env.REALTIME_VAD_PREFIX_MS || '320');

export class RealtimeSessionManager {
  private sessions = new Map<string, RealtimeSession>();
  private readonly openAiApiKey = process.env.OPENAI_API_KEY;
  private readonly openAiModel = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime';
  private readonly toolsManager = new RealtimeToolsManager();
  private eventManager?: RealtimeEventManager;
  /** Per-session: ms from Twilio start → first outbound audio frame to Twilio */
  private callStartTimes = new Map<string, number>();

  async createSession(config: RealtimeSessionConfig): Promise<RealtimeSession> {
    const sessionId = `realtime_${config.tenantId}_${config.callSid}_${Date.now()}`;
    
    logger.info('REALTIME_SESSION_CREATE', {
      sessionId,
      tenantId: config.tenantId,
      callSid: config.callSid,
      voice: config.voice,
      language: config.language,
    });

    const session: RealtimeSession = {
      id: sessionId,
      tenantId: config.tenantId,
      callSid: config.callSid,
      streamSid: config.streamSid,
      openAiWs: null,
      twilioWs: null,
      startTime: new Date(),
      lastActivity: new Date(),
      isActive: true,
      config,
      transcriptLines: [],
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Open the OpenAI Realtime WebSocket eagerly, before the session/config is known.
   * Lets the handshake (DNS/TLS/connect) run in parallel with Twilio's "start" event
   * and the prompt-prefetch, instead of serially after both — this is what was
   * causing an audible pause before the greeting on live calls.
   */
  preconnectOpenAI(): { ws: WebSocket; ready: Promise<void> } {
    const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${this.openAiModel}`, {
      headers: {
        'Authorization': `Bearer ${this.openAiApiKey}`,
      }
    });

    const ready = new Promise<void>((resolve, reject) => {
      let settled = false;
      ws.once('open', () => {
        if (settled) return;
        settled = true;
        resolve();
      });
      ws.once('error', (error) => {
        if (settled) return;
        settled = true;
        reject(new Error(`OpenAI preconnect error: ${error.message}`));
      });
      ws.once('close', (code, reason) => {
        if (settled) return;
        settled = true;
        reject(new Error(`OpenAI preconnect closed before ready: code=${code} reason=${reason.toString()}`));
      });
      setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('OpenAI preconnect timeout (10s)'));
        try { ws.close(); } catch { /* ignore */ }
      }, 10000);
    });

    return { ws, ready };
  }

  async connectToOpenAI(
    session: RealtimeSession,
    preconnected?: { ws: WebSocket; ready: Promise<void> }
  ): Promise<void> {
    if (!this.openAiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    let ws: WebSocket;
    if (preconnected) {
      try {
        await preconnected.ready;
        ws = preconnected.ws;
        logger.info('REALTIME_OPENAI_PRECONNECT_REUSED', {
          sessionId: session.id,
          tenantId: session.tenantId,
        });
      } catch (err) {
        logger.warn('REALTIME_OPENAI_PRECONNECT_FALLBACK', {
          sessionId: session.id,
          tenantId: session.tenantId,
          error: String(err),
        });
        ws = this.openFreshOpenAISocket();
      }
    } else {
      logger.info('REALTIME_OPENAI_CONNECT_START', {
        sessionId: session.id,
        tenantId: session.tenantId,
      });
      ws = this.openFreshOpenAISocket();
    }

    return this.bindSocketToSession(session, ws);
  }

  private openFreshOpenAISocket(): WebSocket {
    return new WebSocket(`wss://api.openai.com/v1/realtime?model=${this.openAiModel}`, {
      headers: {
        'Authorization': `Bearer ${this.openAiApiKey}`,
      }
    });
  }

  /** Wait for the socket to be open (no-op if already open), then configure the session. */
  private bindSocketToSession(session: RealtimeSession, ws: WebSocket): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const configure = () => {
        session.openAiWs = ws as any;
        this.configureSession(session).then(() => {
          settled = true;
          resolve();
        }).catch((err) => {
          settled = true;
          reject(err);
        });
      };

      if (ws.readyState === WebSocket.OPEN) {
        configure();
      } else {
        ws.once('open', () => {
          logger.info('REALTIME_OPENAI_CONNECTED', {
            sessionId: session.id,
            tenantId: session.tenantId,
          });
          configure();
        });
      }

      ws.on('message', (data) => {
        this.handleOpenAIMessage(session, data);
      });

      ws.on('error', (error) => {
        logger.error('REALTIME_OPENAI_ERROR', {
          sessionId: session.id,
          tenantId: session.tenantId,
          error: error.message,
          stack: (error as any).stack?.substring(0, 300),
        });
        if (!settled) {
          settled = true;
          reject(new Error(`OpenAI WebSocket error: ${error.message}`));
        }
      });

      ws.on('close', (code, reason) => {
        logger.error('REALTIME_OPENAI_CLOSED', {
          sessionId: session.id,
          tenantId: session.tenantId,
          code,
          reason: reason.toString(),
          settled,
        });

        if (!settled) {
          settled = true;
          reject(new Error(`OpenAI WebSocket closed before ready: code=${code} reason=${reason.toString()}`));
          return;
        }

        // Attempt reconnection for any unexpected close
        if (session.isActive) {
          logger.warn('REALTIME_OPENAI_RECONNECTING', {
            sessionId: session.id,
            tenantId: session.tenantId,
            code,
            reason: reason.toString(),
          });
          setTimeout(() => {
            if (session.isActive) {
              this.connectToOpenAI(session).catch(err => {
                logger.error('REALTIME_OPENAI_RECONNECT_FAILED', {
                  sessionId: session.id,
                  error: String(err),
                });
                session.isActive = false;
              });
            }
          }, 500);
        }
      });

      // Set timeout for connection/configure
      setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('OpenAI connection timeout (10s)'));
          try { ws.close(); } catch { /* ignore */ }
        }
      }, 10000);
    });
  }

  markCallStarted(sessionId: string): void {
    this.callStartTimes.set(sessionId, Date.now());
  }

  private async configureSession(session: RealtimeSession): Promise<void> {
    const hasGreeting =
      Boolean(session.config.greeting?.trim()) && !session.config.skipAiGreeting;
    const twilioAlreadyGreeted = Boolean(session.config.skipAiGreeting);

    const sessionConfig = {
      type: 'session.update',
      session: {
        type: 'realtime',
        instructions: `${buildHumanRealtimePreamble(session.config.language)}${
          hasGreeting
            ? '\n\nSay your opening greeting once, then listen. Never repeat your introduction.'
            : twilioAlreadyGreeted
              ? '\n\nThe caller already heard the phone greeting. Do not say hello again — wait for them to speak, then respond naturally.'
              : ''
        }\n\n${session.config.instructions}`,
        audio: {
          input: {
            transcription: { model: 'whisper-1' },
            format: { type: 'audio/pcmu' },
            turn_detection: {
              type: 'server_vad',
              threshold: VAD_THRESHOLD,
              prefix_padding_ms: VAD_PREFIX_PADDING_MS,
              silence_duration_ms: VAD_SILENCE_MS,
              interrupt_response: true,
              create_response: !hasGreeting,
            },
          },
          output: {
            format: { type: 'audio/pcmu' },
            voice: session.config.voice || DEFAULT_REALTIME_VOICE,
            speed: clampSpeechSpeed(session.config.speechRate),
          },
        },
        tools: session.config.tools,
      },
    };

    logger.info('REALTIME_SESSION_CONFIGURE', {
      sessionId: session.id,
      tenantId: session.tenantId,
      voice: session.config.voice,
      toolsCount: session.config.tools.length,
      hasGreeting,
      twilioAlreadyGreeted,
    });

    this.sendToOpenAI(session, sessionConfig);

    if (hasGreeting) {
      session.greetingPending = true;
      session.greetingTriggered = false;
      setTimeout(() => {
        if (!session.isActive || !session.greetingPending) return;
        logger.warn('REALTIME_GREETING_FALLBACK', { sessionId: session.id });
        this.tryTriggerGreeting(session, 'fallback');
      }, 350);
    }
  }

  private tryTriggerGreeting(session: RealtimeSession, source: string): void {
    if (!session.isActive || !session.greetingPending || session.greetingTriggered) return;
    session.greetingPending = false;
    session.greetingTriggered = true;
    logger.info('REALTIME_GREETING_SCHEDULE', { sessionId: session.id, source });
    this.triggerGreeting(session);
  }

  private triggerGreeting(session: RealtimeSession): void {
    const greeting = session.config.greeting?.trim();
    if (!greeting) return;

    session.greetingInProgress = true;

    logger.info('REALTIME_GREETING_TRIGGER', {
      sessionId: session.id,
      tenantId: session.tenantId,
      greeting: greeting.substring(0, 100),
    });

    // Audio output is configured on session.update; only pass instructions here
    // (response.modalities is not valid on gpt-realtime)
    this.sendToOpenAI(session, {
      type: 'response.create',
      response: {
        instructions: buildGreetingSpeakInstruction(greeting, session.config.language),
      },
    });
  }

  private handleOpenAIMessage(session: RealtimeSession, data: WebSocket.Data): void {
    try {
      const event: OpenAIServerEvent = JSON.parse(data.toString());
      session.lastActivity = new Date();

      logger.debug('REALTIME_OPENAI_MESSAGE', {
        sessionId: session.id,
        tenantId: session.tenantId,
        type: event.type,
      });

      switch (event.type) {
        case 'session.created':
          logger.info('REALTIME_OPENAI_SESSION_CREATED', {
            sessionId: session.id,
            id: event.id,
          });
          break;

        case 'session.updated':
          logger.info('REALTIME_OPENAI_SESSION_UPDATED', {
            sessionId: session.id,
          });
          setImmediate(() => this.tryTriggerGreeting(session, 'session.updated'));
          break;

        case 'response.created':
          this.eventManager?.recordEvent({
            type: 'response_started',
            timestamp: new Date(),
            sessionId: session.id,
            data: { responseId: event.response?.id },
          });
          break;

        case 'response.done':
          this.handleResponseDone(session, event);
          break;

        case 'response.audio.delta':
        case 'response.output_audio.delta':
          logger.debug('REALTIME_AUDIO_DELTA_RECEIVED', { sessionId: session.id, eventType: event.type, hasData: !!event.delta || !!event.data });
          this.handleAudioDelta(session, event);
          break;
        
        case 'response.audio.done':
        case 'response.output_audio.done':
          logger.debug('REALTIME_OPENAI_AUDIO_DONE', {
            sessionId: session.id,
          });
          break;

        case 'response.text.delta':
        case 'response.output_text.delta':
          this.handleTextDelta(session, event);
          break;
        
        case 'response.text.done':
        case 'response.output_audio_transcript.done':
        case 'response.audio_transcript.done':
          if (event.transcript || event.text) {
            appendSessionTranscript(
              session,
              'assistant',
              String(event.transcript || event.text)
            );
          }
          break;

        case 'response.output_audio_transcript.delta':
          break;

        case 'conversation.item.input_audio_transcription.completed':
          if (event.transcript) {
            appendSessionTranscript(session, 'caller', String(event.transcript));
          }
          break;

        case 'conversation.item.created':
          if (event.item?.type === 'message') {
            const text = extractMessageText(event.item);
            if (text) {
              appendSessionTranscript(
                session,
                event.item.role === 'user' ? 'caller' : 'assistant',
                text
              );
            }
          }
          logger.debug('REALTIME_CONVERSATION_ITEM', {
            sessionId: session.id,
            itemType: event.item?.type,
            itemRole: event.item?.role,
          });
          break;

        case 'response.function_call_arguments.done':
          this.handleFunctionCall(session, event);
          break;
        
        case 'response.output_item.done':
          // Track tool call output items
          if (event.item?.type === 'function_call') {
            logger.debug('REALTIME_FUNCTION_CALL_OUTPUT', {
              sessionId: session.id,
              name: event.item.name,
            });
          }
          break;

        case 'input_audio_buffer.speech_started':
          logger.info('REALTIME_SPEECH_STARTED', {
            sessionId: session.id,
            itemId: event.item_id,
          });
          // Note: Do NOT send response.cancel here — OpenAI's server VAD
          // automatically handles interruption. Sending cancel when no response
          // is active causes a fatal error (response_cancel_not_active).
          this.eventManager?.recordInterruption(session.id);
          break;

        case 'input_audio_buffer.speech_stopped':
          logger.debug('REALTIME_SPEECH_STOPPED', {
            sessionId: session.id,
          });
          break;

        case 'rate_limits.updated':
          logger.debug('REALTIME_RATE_LIMITS', {
            sessionId: session.id,
            limits: event.rate_limits,
          });
          break;

        case 'error':
          this.handleOpenAIError(session, event);
          break;
        
        default:
          logger.debug('REALTIME_OPENAI_UNHANDLED', {
            sessionId: session.id,
            tenantId: session.tenantId,
            type: event.type,
          });
      }
    } catch (error) {
      logger.error('REALTIME_OPENAI_MESSAGE_PARSE_ERROR', {
        sessionId: session.id,
        tenantId: session.tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private handleResponseDone(session: RealtimeSession, event: any): void {
    const response = event.response;
    if (!response) return;

    logger.info('REALTIME_RESPONSE_DONE', {
      sessionId: session.id,
      status: response.status,
      outputCount: response.output?.length,
    });

    // Log any status details (incomplete, cancelled, failed)
    if (response.status_details) {
      logger.info('REALTIME_RESPONSE_STATUS_DETAILS', {
        sessionId: session.id,
        details: response.status_details,
      });
    }

    if (response.status === 'completed' && Array.isArray(response.output)) {
      for (const item of response.output) {
        if (item?.type === 'message' && item.role === 'assistant') {
          const text = extractMessageText(item);
          if (text) appendSessionTranscript(session, 'assistant', text);
        }
      }
    }

    if (!session.greetingInProgress) return;

    if (response.status === 'completed') {
      this.finishGreeting(session);
      return;
    }

    const reason = response.status_details?.reason;
    if (response.status === 'cancelled' && reason === 'turn_detected' && !session.greetingRetried) {
      session.greetingRetried = true;
      logger.warn('REALTIME_GREETING_RETRY', { sessionId: session.id });
      this.triggerGreeting(session);
      return;
    }

    this.finishGreeting(session);
  }

  private finishGreeting(session: RealtimeSession): void {
    session.greetingInProgress = false;
    this.enableCallerTurnDetection(session);
  }

  private enableCallerTurnDetection(session: RealtimeSession): void {
    this.sendToOpenAI(session, {
      type: 'session.update',
      session: {
        type: 'realtime',
        audio: {
          input: {
            turn_detection: {
              type: 'server_vad',
              threshold: VAD_THRESHOLD,
              silence_duration_ms: VAD_SILENCE_MS,
              interrupt_response: true,
              create_response: true,
            },
          },
        },
      },
    });
    logger.info('REALTIME_VAD_ENABLED_AFTER_GREETING', { sessionId: session.id });
  }

  private handleAudioDelta(session: RealtimeSession, event: any): void {
    if (!session.twilioWs || session.twilioWs.readyState !== WebSocket.OPEN) {
      logger.warn('REALTIME_AUDIO_TWILIO_NOT_READY', {
        sessionId: session.id,
        readyState: session.twilioWs?.readyState,
        streamSid: session.streamSid,
      });
      return;
    }

    if (!session.streamSid) {
      logger.warn('REALTIME_AUDIO_NO_STREAM_SID', { sessionId: session.id });
      return;
    }

    const audioPayload = event.delta || event.data || event.audio;

    if (!audioPayload) {
      logger.warn('REALTIME_AUDIO_NO_PAYLOAD', {
        sessionId: session.id,
        eventType: event.type,
        eventKeys: Object.keys(event).join(','),
      });
      return;
    }

    const started = this.callStartTimes.get(session.id);
    if (started && !session.firstAudioSentAt) {
      session.firstAudioSentAt = Date.now();
      logger.info('REALTIME_TIME_TO_FIRST_AUDIO', {
        sessionId: session.id,
        tenantId: session.tenantId,
        msFromCallStart: session.firstAudioSentAt - started,
      });
    }

    audioDiagnosticsManager.recordOutboundFrame(session.id, audioPayload);

    const twilioMessage = {
      event: 'media',
      streamSid: session.streamSid,
      media: {
        payload: audioPayload,
        track: 'outbound',
      },
    };

    try {
      session.twilioWs.send(JSON.stringify(twilioMessage));
    } catch (err) {
      logger.error('REALTIME_AUDIO_TWILIO_SEND_FAILED', {
        sessionId: session.id,
        error: String(err),
      });
    }

    logger.debug('REALTIME_AUDIO_TO_TWILIO', {
      sessionId: session.id,
      tenantId: session.tenantId,
      payloadSize: audioPayload?.length || 0,
    });
  }

  private handleTextDelta(session: RealtimeSession, event: any): void {
    logger.debug('REALTIME_TEXT_DELTA', {
      sessionId: session.id,
      tenantId: session.tenantId,
      delta: event.delta?.substring(0, 100),
    });
  }

  private handleFunctionCall(session: RealtimeSession, event: any): void {
    let parsedArgs: any;
    try {
      parsedArgs = typeof event.arguments === 'string' ? JSON.parse(event.arguments) : event.arguments;
    } catch {
      parsedArgs = { raw: event.arguments };
    }

    logger.info('REALTIME_FUNCTION_CALL', {
      sessionId: session.id,
      tenantId: session.tenantId,
      name: event.name,
      callId: event.call_id,
      arguments: parsedArgs,
    });

    // Track the tool call
    this.eventManager?.recordToolCall(session.id, event.name, 0);

    this.executeTool(session, event.name, parsedArgs, event.call_id).catch(error => {
      logger.error('REALTIME_TOOL_EXECUTION_ERROR', {
        sessionId: session.id,
        tenantId: session.tenantId,
        toolName: event.name,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  private handleOpenAIError(session: RealtimeSession, event: any): void {
    logger.error('REALTIME_OPENAI_PROTOCOL_ERROR', {
      sessionId: session.id,
      tenantId: session.tenantId,
      error: event.error,
      errorType: event.error?.type,
      errorCode: event.error?.code,
      errorMessage: event.error?.message,
    });

    // Only close session for truly fatal errors (greeting format issues are recoverable)
    const nonFatalCodes = new Set([
      'response_cancel_not_active',
      'conversation_already_has_active_response',
      'invalid_value',
      'unknown_parameter',
    ]);
    const fatalCodes = ['invalid_api_key', 'insufficient_quota', 'server_error'];
    const code = event.error?.code as string | undefined;
    const isFatal =
      (code && fatalCodes.includes(code)) ||
      (event.error?.type === 'invalid_request_error' && code && !nonFatalCodes.has(code));

    if (isFatal) {
      this.handleError(session, {
        sessionId: session.id,
        type: 'session',
        message: `OpenAI protocol error: ${event.error?.message || 'Unknown error'}`,
        timestamp: new Date(),
        recoverable: false,
      });
    }
  }

  private async executeTool(session: RealtimeSession, toolName: string, args: any, callId?: string): Promise<void> {
    const TOOL_TIMEOUT_MS = 10000;
    const toolCallId = callId || `call_${Date.now()}`;
    
    try {
      const startTime = Date.now();
      const result = await Promise.race([
        this.toolsManager.executeTool(session, toolName, args),
        new Promise<ToolResult>((_, reject) => 
          setTimeout(() => reject(new Error(`Tool '${toolName}' timed out after ${TOOL_TIMEOUT_MS}ms`)), TOOL_TIMEOUT_MS)
        ),
      ]);

      const executionTime = Date.now() - startTime;
      this.eventManager?.recordToolCall(session.id, toolName, executionTime);

      const response = {
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: toolCallId,
          output: JSON.stringify(result)
        }
      };

      this.sendToOpenAI(session, response);

      const speakInstructions = buildPostToolSpeakInstruction(toolName, result);
      if (speakInstructions && session.isActive) {
        this.sendToOpenAI(session, {
          type: 'response.create',
          response: { instructions: speakInstructions },
        });
      }
    } catch (error) {
      const errorResponse = {
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: toolCallId,
          output: JSON.stringify({ 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          })
        }
      };

      this.sendToOpenAI(session, errorResponse);

      const failSpeak = buildPostToolSpeakInstruction(toolName, { success: false });
      if (failSpeak && session.isActive) {
        this.sendToOpenAI(session, {
          type: 'response.create',
          response: { instructions: failSpeak },
        });
      }
    }
  }

  private handleError(session: RealtimeSession, error: RealtimeError): void {
    logger.error('REALTIME_SESSION_ERROR', {
      sessionId: session.id,
      tenantId: session.tenantId,
      type: error.type,
      message: error.message,
      recoverable: error.recoverable,
    });

    if (!error.recoverable) {
      this.closeSession(session);
    }
  }

  sendToOpenAI(session: RealtimeSession, message: any): void {
    if (!session.openAiWs || session.openAiWs.readyState !== WebSocket.OPEN) {
      logger.warn('REALTIME_OPENAI_NOT_CONNECTED', {
        sessionId: session.id,
        tenantId: session.tenantId,
      });
      return;
    }

    session.openAiWs.send(JSON.stringify(message));
    
    logger.debug('REALTIME_MESSAGE_TO_OPENAI', {
      sessionId: session.id,
      tenantId: session.tenantId,
      type: message.type,
    });
  }

  sendAudioToOpenAI(session: RealtimeSession, audioPayload: string): void {
    // Forward caller audio during greeting (interrupt_response is off) so the model hears "hello?" etc.

    const message = {
      type: 'input_audio_buffer.append',
      audio: audioPayload
    };

    this.sendToOpenAI(session, message);
  }

  setTwilioWebSocket(session: RealtimeSession, twilioWs: WebSocket): void {
    session.twilioWs = twilioWs as any;
    
    twilioWs.on('close', () => {
      // Only close if not already closed (prevents recursive close loop)
      if (session.isActive) {
        this.closeSession(session);
      }
    });
  }

  setEventManager(em: RealtimeEventManager): void {
    this.eventManager = em;
  }

  closeSession(session: RealtimeSession): void {
    if (!session.isActive) return;
    session.isActive = false;

    // Close OpenAI WebSocket without triggering onclose handler loop
    if (session.openAiWs) {
      try {
        (session.openAiWs as any).removeAllListeners();
        if (session.openAiWs.readyState === WebSocket.OPEN || session.openAiWs.readyState === WebSocket.CONNECTING) {
          session.openAiWs.close(1000);
        }
      } catch { /* ignore */ }
      session.openAiWs = null;
    }

    // Do NOT close twilioWs here — it's owned by the caller and the close event
    // that triggered this method already handles that lifecycle
    session.twilioWs = null;

    this.sessions.delete(session.id);
  }

  getSession(sessionId: string): RealtimeSession | undefined {
    return this.sessions.get(sessionId);
  }

  getActiveSessionCount(): number {
    return Array.from(this.sessions.values()).filter(s => s.isActive).length;
  }

  listActiveSessionsForTenant(tenantId: string): RealtimeSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.isActive && s.tenantId === tenantId
    );
  }

  /** Push new instructions/tools to an in-flight OpenAI realtime session. */
  updateLiveSessionConfig(
    session: RealtimeSession,
    patch: Pick<RealtimeSessionConfig, 'instructions' | 'tools' | 'voice' | 'speechRate'>
  ): void {
    if (!session.isActive) return;

    session.config = { ...session.config, ...patch };

    const preamble = buildHumanRealtimePreamble(session.config.language);
    const instructions = `${preamble}\n\nThe caller already heard the phone greeting. Do not say hello again — respond naturally with the updated business information.\n\n${patch.instructions}`;

    this.sendToOpenAI(session, {
      type: 'session.update',
      session: {
        type: 'realtime',
        instructions,
        tools: patch.tools,
        audio: {
          output: {
            voice: patch.voice || session.config.voice || DEFAULT_REALTIME_VOICE,
            speed: clampSpeechSpeed(patch.speechRate ?? session.config.speechRate),
          },
        },
      },
    });

    logger.info('REALTIME_SESSION_CONFIG_RELOADED', {
      sessionId: session.id,
      tenantId: session.tenantId,
    });
  }

  cleanupInactiveSessions(): void {
    const now = Date.now();
    const inactiveThreshold = 5 * 60 * 1000; // 5 minutes

    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivity.getTime() > inactiveThreshold) {
        logger.info('REALTIME_SESSION_CLEANUP', {
          sessionId,
          tenantId: session.tenantId,
          inactiveDuration: now - session.lastActivity.getTime(),
        });
        this.closeSession(session);
      }
    }
  }
}
