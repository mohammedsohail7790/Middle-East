import { IncomingMessage } from 'http';
import { Socket } from 'net';
import { parse } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../logger.js';
import { RealtimeSessionManager } from './realtime.session.js';
import { RealtimeSessionConfig, TwilioWsEvent } from './realtime.types.js';
import { AiService, TenantVoiceConfig } from '../voice/ai.service.js';
import { concurrencyGuard } from '../voice/concurrency.guard.js';
import { billingService } from '../billing/billing.service.js';
import { CacheHelpers } from '../cache.js';
import { voiceRedis } from '../voice/redis.client.js';
import { voiceMetrics } from '../voice/voice.metrics.js';
import { RealtimeEventManager } from './realtime.events.js';
import { RealtimeMemoryManager } from './realtime.memory.js';
import { RealtimeAnalyticsManager } from './realtime.analytics.js';
import { isLanguageAllowed, type LanguageCode } from '../../config/plan-config.js';
import { RealtimeHealthMonitor } from './realtime.health.js';
import { wsRateLimiter } from '../ws-rate-limiter.js';
import { audioDiagnosticsManager } from './realtime.audio-diag.js';
import { sessionCoordinator } from './session-coordinator.js';
import { heartbeatManager } from './heartbeat-manager.js';
import { sessionRegistry } from './session-registry.js';
import { sessionWatchdog } from './session-watchdog.js';
import {
  isP1RuntimeSessionEnabled,
  P1_RECONNECT_GRACE_MS,
} from './realtime-session.js';
import {
  clampSpeechSpeed,
  DEFAULT_REALTIME_VOICE,
  isRealtimeBuiltinVoice,
  normalizeGreetingText,
  REALTIME_BUILTIN_VOICES,
} from './receptionist-voice.js';
import { startVoiceConfigInvalidateListener } from '../voice/voice-config-invalidate.listener.js';
import { buildToolsList } from './realtime-tool-schemas.js';
import { buildFullPrompt } from './realtime-prompt-builder.js';
import { finalizeRuntimeSession } from './realtime.post-call.js';

interface SessionPrefetchBundle {
  instructions: string;
  voice: string;
  speechRate: number;
  greeting: string;
}

interface RealtimeWebSocketState {
  streamTokenFromUrl?: string;
  wsSessionId?: string;
  /** WS upgrade time — soak overlap vs sequential fanout */
  transportConnectedAt?: number;
  sessionId?: string;
  tenantId?: string;
  callSid?: string;
  streamSid?: string;
  callerPhone?: string;
  sessionManager: RealtimeSessionManager;
  tenantConfig?: TenantVoiceConfig;
  /** Built when WS connects so Twilio "start" avoids extra DB round-trips */
  sessionBundle?: Promise<SessionPrefetchBundle>;
  /** OpenAI WebSocket opened eagerly at transport-connect time so the greeting doesn't wait on the handshake */
  openAiPreconnect?: { ws: import('ws').WebSocket; ready: Promise<void> };
  inactivityTimeout?: NodeJS.Timeout;
  /** Resolves when the OpenAI session is fully connected and ready for media */
  sessionReady?: Promise<void>;
  sessionReadyResolve?: () => void;
  /** Buffer media payloads received before session is ready */
  mediaBuffer?: string[];
  /** Whether session setup is complete */
  isSessionReady?: boolean;
  /** P1-A runtime authority session id */
  runtimeSessionId?: string;
  /** Twilio Media Streams omit ?token= on WS URL — auth happens on "start" + streamToken param */
  twilioDeferredAuth?: boolean;
  streamAuthenticated?: boolean;
  twilioAuthTimer?: ReturnType<typeof setTimeout>;
  /** Twilio stop received — skip reconnect grace */
  callEnded?: boolean;
  /** Caller declined the compliance consent prompt — call proceeds normally
   *  but must not be recorded or have its transcript persisted. */
  consentDeclined?: boolean;
}

export class RealtimeGateway {
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly sessionManager = new RealtimeSessionManager();
  private readonly aiService = new AiService();
  private readonly sessionsBySocket = new Map<WebSocket, RealtimeWebSocketState>();
  private readonly inactivityTimeoutMs = Number(process.env.VOICE_WS_INACTIVITY_TIMEOUT_MS || 90000);
  private readonly eventManager = new RealtimeEventManager();
  private readonly memoryManager = new RealtimeMemoryManager();
  private readonly analyticsManager = new RealtimeAnalyticsManager(this.eventManager);
  private readonly healthMonitor: RealtimeHealthMonitor;

  constructor() {
    this.healthMonitor = new RealtimeHealthMonitor(this);

    // Wire event manager to session manager for protocol event tracking
    this.sessionManager.setEventManager(this.eventManager);
    
    this.wss.on('connection', (socket, req) => this.onConnection(socket, req));
    this.wss.on('error', (error) => {
      logger.error('RealtimeGateway WebSocketServer error', { error: String(error) });
    });

    // Cleanup inactive sessions every minute
    setInterval(() => {
      this.sessionManager.cleanupInactiveSessions();
      this.analyticsManager.cleanupOldAnalytics();
    }, 60000);

    // Start distributed session coordination
    sessionCoordinator.startHeartbeat(15000);
    sessionCoordinator.startCleanup(30000);

    // Start heartbeat manager for zombie detection
    heartbeatManager.start();
    sessionWatchdog.start();

    startVoiceConfigInvalidateListener((tenantId) => {
      void this.reloadTenantConfigForActiveCalls(tenantId);
    });
  }

  /** Reload tenant voice config for every active realtime call (after cache invalidation). */
  async reloadTenantConfigForActiveCalls(tenantId: string): Promise<void> {
    const reloads: Promise<void>[] = [];

    for (const [, state] of this.sessionsBySocket) {
      if (state.tenantId !== tenantId || !state.isSessionReady || !state.sessionId) continue;

      reloads.push(
        (async () => {
          try {
            state.tenantConfig = await this.aiService.getTenantVoiceConfig(tenantId, null);
            const bundle = await this.prepareSessionBundle(tenantId, state.tenantConfig);
            const session = state.sessionManager.getSession(state.sessionId!);
            if (!session?.isActive) return;

            let tenantPlan = 'essential';
            try {
              const sub = await billingService.getSubscription(tenantId);
              tenantPlan = sub?.status === 'trialing' ? 'trial' : (sub?.plan || 'essential');
            } catch {
              /* use essential fallback */
            }

            state.sessionManager.updateLiveSessionConfig(session, {
              instructions: bundle.instructions,
              tools: buildToolsList(state.tenantConfig!, tenantPlan),
              voice: bundle.voice,
              speechRate: bundle.speechRate,
            });
          } catch (error) {
            logger.warn('REALTIME_TENANT_CONFIG_RELOAD_FAILED', {
              tenantId,
              sessionId: state.sessionId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        })()
      );
    }

    await Promise.allSettled(reloads);
  }

  canHandleUpgrade(request: IncomingMessage): boolean {
    if (!request.url) return false;
    const normalized = request.url.split('?')[0].replace(/\/+/g, '/');
    return normalized.startsWith('/ws/realtime/');
  }

  extractTenantId(request: IncomingMessage): string | undefined {
    if (!request.url) return undefined;
    const parts = request.url.split('?')[0].split('/').filter(Boolean);
    return parts[2];
  }

  upgrade(request: IncomingMessage, socket: Socket, head: Buffer): void {
    logger.info('REALTIME_WS_UPGRADE_START', {
      url: request.url,
      method: request.method,
      headers: request.headers,
      ip: request.socket.remoteAddress,
      time: new Date().toISOString(),
    });

    const upgradeTimer = setTimeout(() => {
      logger.error('Realtime WebSocket handleUpgrade timed out', {
        url: request.url,
        headers: request.headers,
      });
      try { socket.destroy(); } catch { /* ignore */ }
    }, 5000);

    try {
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        clearTimeout(upgradeTimer);
        logger.info('REALTIME_WS_UPGRADE_SUCCESS', {
          url: request.url,
          ip: request.socket.remoteAddress,
          time: new Date().toISOString(),
        });
        this.wss.emit('connection', ws, request);
      });
    } catch (error) {
      clearTimeout(upgradeTimer);
      logger.error('REALTIME_WS_UPGRADE_FAILED', { 
        error: String(error), 
        url: request.url, 
        stack: error instanceof Error ? error.stack : undefined 
      });
      try { socket.destroy(); } catch { /* ignore */ }
    }
  }

  private async onConnection(socket: WebSocket, request: IncomingMessage): Promise<void> {
    const url = request.url;
    const parsed = parse(url || '', true);
    const parts = (parsed.pathname || '').split('/').filter(Boolean);
    
    // Expected format: /ws/realtime/{tenantId}
    const tenantId = parts[2];

    if (!tenantId) {
      logger.error('REALTIME_MISSING_TENANT_ID', { url: request.url });
      socket.close(1008, 'Missing tenant ID');
      return;
    }

    logger.info('REALTIME_CONNECTION_ESTABLISHED', {
      tenantId,
      url,
      origin: request.headers.origin,
      ipAddress: request.socket.remoteAddress,
    });

    const tokenFromUrl =
      typeof parsed.query?.token === 'string'
        ? parsed.query.token
        : typeof parsed.query?.token === 'object' && Array.isArray(parsed.query.token)
          ? parsed.query.token[0]
          : undefined;

    const twilioMediaStream = /Twilio\.TmeWs/i.test(
      String(request.headers['user-agent'] || '')
    );

    if (tokenFromUrl) {
      const { verifyWsSessionToken } = await import('../auth/ws-session-tokens.js');
      const ok = await verifyWsSessionToken(tokenFromUrl, { tenantId }, { consumeNonce: false });
      if (!ok) {
        logger.warn('REALTIME_WS_SESSION_DENIED', { tenantId, url });
        const { logWsSessionEvent } = await import('../observability/validation-telemetry.js');
        logWsSessionEvent('upgrade_rejected', { tenantId, reason: 'invalid_token' });
        socket.close(1008, 'Invalid or expired session token');
        return;
      }
      const { logWsSessionEvent } = await import('../observability/validation-telemetry.js');
      logWsSessionEvent('upgrade_accepted', { tenantId, phase: 'pre_connect' });
    } else if (twilioMediaStream) {
      // Twilio strips query strings from the Stream WebSocket URL; streamToken arrives in "start" customParameters.
      logger.info('REALTIME_TWILIO_DEFERRED_AUTH', {
        tenantId,
        url,
        note: 'Awaiting start event streamToken',
      });
    } else if (process.env.NODE_ENV === 'production') {
      logger.warn('REALTIME_WS_MISSING_TOKEN', { tenantId, url });
      const { logWsSessionEvent } = await import('../observability/validation-telemetry.js');
      logWsSessionEvent('upgrade_rejected', { tenantId, reason: 'missing_token' });
      socket.close(1008, 'Session token required');
      return;
    }

    const { newWsSessionId } = await import('../observability/correlation-context.js');
    const { patchCorrelation } = await import('../observability/correlation-context.js');
    const wsSessionId = newWsSessionId();
    patchCorrelation({ tenantId, wsSessionId });
    const transportConnectedAt = Date.now();

    const state: RealtimeWebSocketState = {
      sessionManager: this.sessionManager,
      tenantId,
      wsSessionId,
      transportConnectedAt,
      streamTokenFromUrl: tokenFromUrl,
      twilioDeferredAuth: twilioMediaStream && !tokenFromUrl,
      streamAuthenticated: Boolean(tokenFromUrl),
    };

    if (state.twilioDeferredAuth) {
      state.twilioAuthTimer = setTimeout(() => {
        if (!state.streamAuthenticated) {
          logger.warn('REALTIME_TWILIO_AUTH_TIMEOUT', { tenantId, url });
          socket.close(1008, 'Stream auth timeout');
        }
      }, 20_000);
    }

    // Create a promise that resolves when tenant config is loaded
    let configResolve: () => void;
    let configReject: (err: Error) => void;
    const configReady = new Promise<void>((resolve, reject) => {
      configResolve = resolve;
      configReject = reject;
    });
    (state as any)._configReady = configReady;

    // Open the OpenAI WebSocket immediately — runs in parallel with tenant-config
    // load, prompt prefetch, and Twilio's "start" event instead of waiting on all
    // of them first (that serial handshake was the source of the pre-greeting pause).
    if (twilioMediaStream) {
      try {
        state.openAiPreconnect = this.sessionManager.preconnectOpenAI();
      } catch (err) {
        logger.warn('REALTIME_OPENAI_PRECONNECT_START_FAILED', {
          tenantId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    this.sessionsBySocket.set(socket, state);

    // Track connection in rate limiter
    const clientIp = (req => {
      const forwarded = req.headers['x-forwarded-for'];
      if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
      return req.socket.remoteAddress || 'unknown';
    })(request);
    wsRateLimiter.registerConnection(socket, clientIp, tenantId);

    // Wire activity tracking
    socket.on('pong', () => wsRateLimiter.updateActivity(socket));

    // Set up message handler
    socket.on('message', async (raw) => {
      wsRateLimiter.updateActivity(socket);
      try {
        await this.handleMessage(socket, state, raw);
      } catch (error) {
        logger.error('REALTIME_MESSAGE_ERROR', {
          tenantId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    socket.on('close', async (code, reason) => {
      logger.info('REALTIME_CONNECTION_CLOSED', {
        tenantId,
        code,
        reason: reason?.toString() || '',
      });
      await this.cleanupConnection(socket, state);
    });

    socket.on('error', (error) => {
      logger.error('REALTIME_CONNECTION_ERROR', {
        tenantId,
        error: error.message,
      });
    });

    // Load tenant configuration
    try {
      state.tenantConfig = await this.aiService.getTenantVoiceConfig(tenantId, null);
      logger.info('REALTIME_TENANT_CONFIG_LOADED', {
        tenantId,
        businessName: state.tenantConfig.businessName,
        language: state.tenantConfig.defaultLanguage,
      });
      configResolve!();
      state.sessionBundle = this.prepareSessionBundle(tenantId, state.tenantConfig);
    } catch (error) {
      logger.error('REALTIME_TENANT_CONFIG_FAILED', {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      configReject!(error instanceof Error ? error : new Error(String(error)));
      socket.close(1011, 'Tenant configuration error');
      return;
    }
  }

  /** Single DB pass for voice + prompt + greeting while Twilio is still connecting */
  private prepareSessionBundle(
    tenantId: string,
    tenantConfig: TenantVoiceConfig
  ): Promise<SessionPrefetchBundle> {
    return (async () => {
      const t0 = Date.now();
      let aiConfig: Awaited<ReturnType<
        typeof import('../ai-config/ai-config.service.js')['aiConfigService']['getConfig']
      >> | null = null;
      try {
        const { aiConfigService } = await import('../ai-config/ai-config.service.js');
        aiConfig = await aiConfigService.getConfig(tenantId);
      } catch {
        aiConfig = null;
      }
      const t1 = Date.now();

      const voice = this.resolveVoiceWithAiConfig(tenantConfig, aiConfig);
      const speechRate = this.resolveSpeechRateWithAiConfig(aiConfig);
      const instructions = await buildFullPrompt(tenantId, tenantConfig, aiConfig);
      const t2 = Date.now();
      const greeting = normalizeGreetingText(tenantConfig.welcomeMessage || '');

      logger.info('REALTIME_SESSION_BUNDLE_TIMING', {
        tenantId,
        aiConfigMs: t1 - t0,
        buildPromptMs: t2 - t1,
        totalMs: t2 - t0,
      });

      return { instructions, voice, speechRate, greeting };
    })();
  }

  private async handleMessage(
    socket: WebSocket, 
    state: RealtimeWebSocketState, 
    raw: WebSocket.Data
  ): Promise<void> {
    const data = JSON.parse(raw.toString()) as TwilioWsEvent;

    logger.debug('REALTIME_MESSAGE_RECEIVED', {
      tenantId: state.tenantId,
      eventType: data.event,
      callSid: state.callSid,
    });

    const anyData = data as any;
    switch (anyData.event) {
      case 'connected':
        logger.debug('REALTIME_TWILIO_CONNECTED', {
          tenantId: state.tenantId,
          callSid: state.callSid,
        });
        break;

      case 'start':
        await this.handleStartEvent(socket, state, anyData);
        break;
      
      case 'media':
        await this.handleMediaEvent(socket, state, anyData);
        break;
      
      case 'stop':
        await this.handleStopEvent(socket, state, anyData);
        break;
      
      default:
        logger.warn('REALTIME_UNHANDLED_EVENT', {
          tenantId: state.tenantId,
          eventType: anyData.event,
        });
    }
  }

  private async handleStartEvent(
    socket: WebSocket,
    state: RealtimeWebSocketState,
    data: any
  ): Promise<void> {
    const start = data.start || {};
    const callSid = start.callSid || data.callSid;
    const streamSid = start.streamSid || data.streamSid;
    const customParameters = start.customParameters || {};

    logger.info('REALTIME_TWILIO_START', {
      tenantId: state.tenantId,
      callSid,
      streamSid,
      customParameters,
    });

    state.callSid = callSid;
    state.streamSid = streamSid;
    state.callerPhone = customParameters?.from || customParameters?.From || '';
    state.consentDeclined =
      customParameters?.consentDeclined === 'true' || customParameters?.consentdeclined === 'true';
    const { patchCorrelation: patchCallCorrelation } = await import(
      '../observability/correlation-context.js'
    );
    patchCallCorrelation({
      tenantId: state.tenantId,
      callSid,
      wsSessionId: state.wsSessionId,
    });

    if (state.wsSessionId) {
      const { recordCallTransportBound } = await import(
        '../observability/session-fanout-telemetry.js'
      );
      await recordCallTransportBound(
        callSid,
        state.wsSessionId,
        state.transportConnectedAt ?? Date.now()
      );
    }
    const streamToken =
      customParameters?.streamToken ||
      customParameters?.streamtoken ||
      state.streamTokenFromUrl ||
      '';
    const { verifyStreamAuthToken, getStreamMeta } = await import('../voice/ws-stream-auth.js');
    if (!(await verifyStreamAuthToken(callSid, streamToken, state.tenantId!))) {
      logger.warn('REALTIME_UNAUTHORIZED_STREAM', {
        tenantId: state.tenantId,
        callSid,
        hasToken: Boolean(streamToken),
        hasCustomToken: Boolean(customParameters?.streamToken || customParameters?.streamtoken),
        hasUrlToken: Boolean(state.streamTokenFromUrl),
      });
      socket.close(1008, 'Unauthorized stream');
      return;
    }

    state.streamAuthenticated = true;
    if (state.twilioAuthTimer) {
      clearTimeout(state.twilioAuthTimer);
      state.twilioAuthTimer = undefined;
    }

    const agentId =
      customParameters?.agentId ||
      customParameters?.agentid ||
      (await getStreamMeta(callSid))?.agentId ||
      null;

    if (agentId && state.tenantConfig) {
      try {
        state.tenantConfig = await this.aiService.getTenantVoiceConfig(state.tenantId!, agentId);
        state.sessionBundle = this.prepareSessionBundle(state.tenantId!, state.tenantConfig);
        logger.info('REALTIME_PHONE_AGENT_ROUTED', { tenantId: state.tenantId, agentId });
      } catch (agentErr) {
        logger.warn('REALTIME_PHONE_AGENT_LOAD_FAILED', {
          tenantId: state.tenantId,
          agentId,
          error: String(agentErr),
        });
      }
    }

    // Initialize media buffer — frames arriving before session is ready will be queued
    state.mediaBuffer = [];
    state.isSessionReady = false;

    // Wait for tenant config to be loaded (may already be resolved)
    try {
      await (state as any)._configReady;
    } catch {
      // Config failed — socket is already being closed
      return;
    }

    let runtimeSession: Awaited<ReturnType<typeof sessionRegistry.getOrCreate>> | undefined;
    let reusingVoiceSession = false;

    if (isP1RuntimeSessionEnabled()) {
      runtimeSession = await sessionRegistry.getOrCreate({
        tenantId: state.tenantId!,
        callSid,
        wsSessionId: state.wsSessionId,
        websocket: socket,
        twilioStreamSid: streamSid,
      });
      state.runtimeSessionId = runtimeSession.sessionId;
      const { patchCorrelation: patchRt } = await import('../observability/correlation-context.js');
      patchRt({ sessionId: runtimeSession.sessionId });

      if (runtimeSession.voiceSessionId) {
        const existingVoice = state.sessionManager.getSession(runtimeSession.voiceSessionId);
        if (existingVoice?.isActive) {
          reusingVoiceSession = true;
          state.sessionId = runtimeSession.voiceSessionId;
          state.sessionManager.setTwilioWebSocket(existingVoice, socket);
          state.isSessionReady = true;
          state.mediaBuffer = undefined;
          heartbeatManager.trackSocket(socket, state.sessionId, state.tenantId!, {
            twilioMediaStream: true,
          });
          this.resetInactivityTimeout(socket, state);
          runtimeSession.updateHeartbeat();
          logger.info('REALTIME_SESSION_REUSED_ON_RECONNECT', {
            runtimeSessionId: runtimeSession.sessionId,
            voiceSessionId: state.sessionId,
            callSid,
            tenantId: state.tenantId,
          });
        }
      }
    }

    if (!reusingVoiceSession) {
    // Check concurrency limits
    if (!(await concurrencyGuard.tryAcquire(state.tenantId!))) {
      logger.warn('REALTIME_CONCURRENCY_LIMIT', {
        tenantId: state.tenantId,
        callSid,
      });
      socket.close(1013, 'Capacity reached');
      return;
    }

    const devTenantId = process.env.DEV_TENANT_ID;
    const isDevTenant =
      process.env.NODE_ENV !== 'production'
      && devTenantId
      && state.tenantId === devTenantId;

    const bundlePromise =
      state.sessionBundle ??
      this.prepareSessionBundle(state.tenantId!, state.tenantConfig!);
    state.sessionBundle = undefined;

    const tGate0 = Date.now();
    // Usage check needs the same subscription row getActiveSubscription already
    // fetches — reuse it instead of a second, redundant DB round trip. Also
    // cache the row itself for a few seconds: the tenant's DB is cross-region
    // (700ms+ per round trip), and a subscription's allowed/blocked status
    // can't meaningfully change within a 15s window, so this absorbs almost
    // all of that cost for back-to-back calls without going stale in any way
    // that matters for call gating.
    const subPromise = CacheHelpers.cacheDatabaseQuery(
      `billing:active-sub:${state.tenantId}`,
      () => billingService.getActiveSubscription(state.tenantId!),
      { ttl: 15 }
    ).then((r) => {
      logger.info('REALTIME_SUB_CHECK_TIMING', { tenantId: state.tenantId, ms: Date.now() - tGate0 });
      // A cache hit deserializes Date fields as plain ISO strings — revive them
      // so `sub` always matches its declared Subscription type regardless of
      // whether this came from cache or a live query.
      if (r) {
        r.currentPeriodStart = new Date(r.currentPeriodStart);
        r.currentPeriodEnd = new Date(r.currentPeriodEnd);
        r.createdAt = new Date(r.createdAt);
        r.updatedAt = new Date(r.updatedAt);
      }
      return r;
    });

    const usagePromise = subPromise.then(async (sub) => {
      const result = isDevTenant
        ? { allowed: true as const, reason: undefined }
        : await billingService.checkUsageAllowance(state.tenantId!, sub);
      logger.info('REALTIME_USAGE_CHECK_TIMING', { tenantId: state.tenantId, ms: Date.now() - tGate0 });
      return result;
    });

    const [usageCheck, sub, bundle] = await Promise.all([
      usagePromise,
      subPromise,
      bundlePromise,
    ]);

    if (!usageCheck.allowed) {
      logger.warn('REALTIME_USAGE_LIMIT', {
        tenantId: state.tenantId,
        callSid,
        reason: usageCheck.reason,
      });
      await concurrencyGuard.release(state.tenantId!);
      socket.close(1008, usageCheck.reason || 'Usage limit reached');
      return;
    }

    if (isDevTenant) {
      logger.info('REALTIME_DEV_TENANT_BYPASS', {
        tenantId: state.tenantId,
        callSid,
        message: 'Billing check bypassed for dev tenant',
      });
    }

    const requestedLanguage = (state.tenantConfig?.defaultLanguage || 'en') as LanguageCode;
    const tenantPlan = sub?.status === 'trialing' ? 'trial' : (sub?.plan || 'essential');
    const effectiveLanguage: LanguageCode = isLanguageAllowed(tenantPlan, requestedLanguage)
      ? requestedLanguage
      : 'en';

    if (requestedLanguage !== effectiveLanguage) {
      logger.warn('REALTIME_LANGUAGE_DOWNGRADED', {
        tenantId: state.tenantId,
        requestedLanguage,
        effectiveLanguage,
        plan: tenantPlan,
      });
    }

    // AI disclosure passed via stream parameter — the webhook skipped Twilio's
    // <Say> so the stream connects at pickup with no dead air; the AI speaks
    // the disclosure itself as the first part of its greeting instead.
    const aiDisclosure = String(
      customParameters?.aiDisclosure || customParameters?.aidisclosure || ''
    ).trim();
    const greetingWithDisclosure =
      [aiDisclosure, bundle.greeting].filter(Boolean).join(' ') || undefined;

    const config: RealtimeSessionConfig = {
      tenantId: state.tenantId!,
      callSid,
      streamSid,
      language: effectiveLanguage,
      voice: bundle.voice,
      instructions: bundle.instructions,
      tools: buildToolsList(state.tenantConfig!, tenantPlan),
      temperature: 0.92,
      greeting: greetingWithDisclosure,
      skipAiGreeting: false,
      speechRate: bundle.speechRate,
    };

    try {
      const session = await state.sessionManager.createSession(config);
      state.sessionId = session.id;
      if (runtimeSession) {
        sessionRegistry.bindVoiceSession(runtimeSession, session.id);
      }
      session.streamSid = streamSid;
      state.sessionManager.markCallStarted(session.id);

      state.sessionManager.setTwilioWebSocket(session, socket);

      // Connect to OpenAI first — greeting fires inside configureSession.
      // Reuse the socket opened at transport-connect time if it's ready; otherwise
      // connectToOpenAI() falls back to a fresh connection automatically.
      await state.sessionManager.connectToOpenAI(session, state.openAiPreconnect);

      // Non-critical tracking after audio path is live
      this.eventManager.startSession(session);
      audioDiagnosticsManager.startSession(session.id, callSid, state.tenantId!);
      if (state.callerPhone) {
        this.memoryManager
          .storeCustomerInfo(session.id, state.tenantId!, callSid, undefined, state.callerPhone)
          .catch(() => {});
      }

      // Mark session as ready — new media frames will flow directly to OpenAI
      // DISCARD the pre-connection buffer (it's background noise that would
      // trigger VAD and cancel the greeting)
      state.isSessionReady = true;
      state.mediaBuffer = undefined;

      logger.info('REALTIME_SESSION_READY', {
        sessionId: session.id,
        tenantId: state.tenantId,
        callSid,
        streamSid,
      });

      void import('../../events/event-publisher.js').then(async ({ publishPlatformEvent }) => {
        const { PlatformEventTypes } = await import('../../events/event-types.js');
        publishPlatformEvent(
          PlatformEventTypes.CALL_STARTED,
          { streamSid, voice: config.voice, language: config.language },
          {
            tenantId: state.tenantId!,
            callSid,
            sessionId: session.id,
          }
        );
        publishPlatformEvent(
          PlatformEventTypes.CALL_CONNECTED,
          { streamSid },
          {
            tenantId: state.tenantId!,
            callSid,
            sessionId: session.id,
          }
        );
      }).catch(() => {});

      // Publish live call state to Redis for dashboard monitoring
      voiceRedis.hset(`live_call:${state.tenantId}:${callSid}`, {
        sessionId: session.id,
        tenantId: state.tenantId!,
        callSid,
        callerPhone: state.callerPhone || '',
        voice: config.voice,
        language: config.language,
        startTime: Date.now().toString(),
        status: 'active',
      }).catch(() => {});
      voiceRedis.expire(`live_call:${state.tenantId}:${callSid}`, 3600).catch(() => {});

      // Non-critical tracking — fire and forget (don't block the audio path)
      this.analyticsManager.trackEvent({
        sessionId: session.id,
        tenantId: state.tenantId!,
        callSid,
        eventType: 'call_start',
        timestamp: new Date(),
        data: {
          voice: config.voice,
          language: config.language,
          toolsCount: config.tools.length,
        }
      }).catch(() => {});

      sessionCoordinator.registerSession(session.id, {
        sessionId: session.id,
        tenantId: state.tenantId!,
        callSid,
        streamSid,
        startTime: Date.now(),
        metadata: {
          voice: config.voice,
          language: config.language,
        },
      }).catch(() => {});

      heartbeatManager.trackSocket(socket, session.id, state.tenantId!, {
        twilioMediaStream: true,
      });
      this.resetInactivityTimeout(socket, state);

      voiceRedis.sadd(`active_calls:${state.tenantId}`, session.id).catch(() => {});
      voiceRedis.expire(`active_calls:${state.tenantId}`, 120).catch(() => {});
      voiceMetrics.callStarted(state.tenantId!);

      void import('../dashboard/dashboard-events.js').then(({ publishDashboardPushType }) => {
        publishDashboardPushType(state.tenantId!, 'call.started', [], { callSid });
      }).catch(() => {});

    } catch (error) {
      logger.error('REALTIME_SESSION_CREATE_FAILED', {
        tenantId: state.tenantId,
        callSid,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Mark session as failed so buffered media is dropped
      state.mediaBuffer = undefined;
      state.isSessionReady = false;

      await concurrencyGuard.release(state.tenantId!);
      socket.close(1011, 'Session creation failed');
    }
    } // !reusingVoiceSession
  }

  private async handleMediaEvent(
    socket: WebSocket,
    state: RealtimeWebSocketState,
    data: any
  ): Promise<void> {
    // Buffer media if session is still being created
    if (!state.isSessionReady) {
      if (state.mediaBuffer) {
        // Cap buffer at 500 frames (~10s of audio) to prevent memory issues
        if (state.mediaBuffer.length < 500) {
          state.mediaBuffer.push(data.media.payload);
        }
      }
      return;
    }

    if (!state.sessionId) {
      // Session setup failed — silently drop frames
      return;
    }

    const session = state.sessionManager.getSession(state.sessionId);
    if (!session) {
      return;
    }

    // Forward audio to OpenAI regardless of isActive flag
    // The sendAudioToOpenAI method already checks if the WS is open

    // Reset inactivity timeout
    this.resetInactivityTimeout(socket, state);

    if (state.runtimeSessionId) {
      sessionRegistry.getBySessionId(state.runtimeSessionId)?.updateHeartbeat();
    }

    // Record audio diagnostics
    audioDiagnosticsManager.recordInboundFrame(state.sessionId, data.media.payload);

    // Forward audio directly to OpenAI
    state.sessionManager.sendAudioToOpenAI(session, data.media.payload);

    logger.debug('REALTIME_AUDIO_FORWARDED', {
      sessionId: state.sessionId,
      tenantId: state.tenantId,
      payloadSize: data.media.payload.length,
    });
  }

  private async handleStopEvent(
    socket: WebSocket,
    state: RealtimeWebSocketState,
    _data: unknown
  ): Promise<void> {
    logger.info('REALTIME_TWILIO_STOP', {
      tenantId: state.tenantId,
      callSid: state.callSid,
    });
    state.callEnded = true;

    await this.cleanupConnection(socket, state);
  }

  private async cleanupConnection(
    socket: WebSocket,
    state: RealtimeWebSocketState
  ): Promise<void> {
    if (state.twilioAuthTimer) {
      clearTimeout(state.twilioAuthTimer);
      state.twilioAuthTimer = undefined;
    }

    // Twilio disconnected before a session ever claimed the preconnected OpenAI
    // socket (e.g. call ended during setup) — close it so it doesn't leak.
    if (!state.sessionId && state.openAiPreconnect) {
      try { state.openAiPreconnect.ws.close(); } catch { /* ignore */ }
      state.openAiPreconnect.ready.catch(() => {});
    }

    if (state.callSid && state.wsSessionId) {
      const { recordCallTransportClosed } = await import(
        '../observability/session-fanout-telemetry.js'
      );
      await recordCallTransportClosed(
        state.callSid,
        state.wsSessionId,
        Date.now()
      );
    }

    const runtime =
      state.runtimeSessionId &&
      sessionRegistry.getBySessionId(state.runtimeSessionId);

    if (runtime && isP1RuntimeSessionEnabled()) {
      sessionRegistry.detachTransport(runtime, 'websocket_close');
      if (!state.callEnded && runtime.voiceSessionId) {
        sessionRegistry.scheduleTerminateAfterGrace(
          runtime,
          () => finalizeRuntimeSession(
            {
              sessionId: state.sessionId!,
              tenantId: state.tenantId!,
              callSid: state.callSid ?? null,
              callerPhone: state.callerPhone ?? null,
              tenantConfig: state.tenantConfig ?? null,
              inactivityTimeout: state.inactivityTimeout,
              sessionManager: state.sessionManager,
              consentDeclined: state.consentDeclined ?? false,
            },
            socket,
            { eventManager: this.eventManager, memoryManager: this.memoryManager, analyticsManager: this.analyticsManager, aiService: this.aiService }
          ),
          P1_RECONNECT_GRACE_MS
        );
        heartbeatManager.untrackSocket(socket);
        wsRateLimiter.unregisterConnection(socket);
        this.sessionsBySocket.delete(socket);
        socket.removeAllListeners();
        return;
      }
      if (state.callEnded) {
        sessionRegistry.terminate(runtime.sessionId);
      }
    }

    await finalizeRuntimeSession(
      {
        sessionId: state.sessionId!,
        tenantId: state.tenantId!,
        callSid: state.callSid ?? null,
        callerPhone: state.callerPhone ?? null,
        tenantConfig: state.tenantConfig ?? null,
        inactivityTimeout: state.inactivityTimeout,
        sessionManager: state.sessionManager,
        consentDeclined: state.consentDeclined ?? false,
      },
      socket,
      { eventManager: this.eventManager, memoryManager: this.memoryManager, analyticsManager: this.analyticsManager, aiService: this.aiService }
    );
  }

  private resetInactivityTimeout(socket: WebSocket, state: RealtimeWebSocketState): void {
    if (state.inactivityTimeout) {
      clearTimeout(state.inactivityTimeout);
    }

    state.inactivityTimeout = setTimeout(async () => {
      logger.warn('REALTIME_INACTIVITY_TIMEOUT', {
        tenantId: state.tenantId,
        sessionId: state.sessionId,
        callSid: state.callSid,
      });

      socket.close(1000, 'Inactivity timeout');
    }, this.inactivityTimeoutMs);
  }

  private readonly voiceMap: Record<string, 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'> = {
    '21m00Tcm4TlvDq8ikWAM': 'shimmer',  // Rachel → shimmer (warm female)
    'EXAVITQu4vr4xnSDxMaL': 'shimmer',  // Bella → shimmer
    'ODq5zmih8GrVes37Dizd': 'echo',      // Patrick → echo
    'pNInz6obpgDQGcFmaJgB': 'fable',     // Adam → fable
    'N2xE4Vf6N8iY7dGxHkLm': 'onyx',     // Default male → onyx
    'onwK4e9Z3TAf3iPpRdBs': 'shimmer',   // Default female → shimmer
  };

  private readonly industryVoicePreferences: Record<string, 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'> = {
    'hvac': 'alloy',
    'plumbing': 'onyx',
    'electrical': 'echo',
    'medical': 'nova',
    'legal': 'fable',
    'financial': 'onyx',
    'real_estate': 'shimmer',
    'insurance': 'alloy',
    'automotive': 'echo',
    'cleaning': 'nova',
    'landscaping': 'alloy',
    'pest_control': 'echo',
    'roofing': 'onyx',
    'general': 'nova',
  };

  private readonly toneVoicePreferences: Record<string, string> = {
    professional: 'marin',
    friendly: 'marin',
    warm: 'marin',
    authoritative: 'cedar',
    empathetic: 'sage',
    energetic: 'coral',
    calm: 'sage',
    formal: 'cedar',
    casual: 'marin',
  };

  private mapVoiceToOpenAI(voiceId?: string, industry?: string, tone?: string): string {
    // Priority 1: If tenant has explicitly set a voice ID, use it directly
    if (voiceId) {
      if (isRealtimeBuiltinVoice(voiceId)) {
        return voiceId;
      }
      // Check legacy ElevenLabs mapping
      if (this.voiceMap[voiceId]) {
        return this.voiceMap[voiceId];
      }
    }

    // Priority 2: Tone-based voice selection
    if (tone) {
      const normalisedTone = tone.toLowerCase().trim();
      if (this.toneVoicePreferences[normalisedTone]) {
        return this.toneVoicePreferences[normalisedTone];
      }
    }

    // Priority 3: Industry-based voice selection
    if (industry) {
      const normalisedIndustry = industry.toLowerCase().trim();
      if (this.industryVoicePreferences[normalisedIndustry]) {
        return this.industryVoicePreferences[normalisedIndustry];
      }
    }

    // Default: coral — natural conversational voice (pairs well with NY English prompts)
    return DEFAULT_REALTIME_VOICE;
  }

  private resolveSpeechRateWithAiConfig(
    aiConfig: { speechRate?: number } | null
  ): number {
    if (aiConfig?.speechRate && aiConfig.speechRate > 0) {
      return clampSpeechSpeed(aiConfig.speechRate);
    }
    return clampSpeechSpeed(undefined);
  }

  private resolveVoiceWithAiConfig(
    tenantConfig: TenantVoiceConfig | undefined,
    aiConfig: { voiceId?: string } | null
  ): string {
    const validVoices = [...REALTIME_BUILTIN_VOICES];
    if (aiConfig?.voiceId && validVoices.includes(aiConfig.voiceId as (typeof validVoices)[number])) {
      return aiConfig.voiceId;
    }
    return this.mapVoiceToOpenAI(tenantConfig?.voiceId, tenantConfig?.industry, tenantConfig?.tone);
  }

  getDebugInfo() {
    return {
      activeConnections: this.sessionsBySocket.size,
      activeSessions: this.sessionManager.getActiveSessionCount(),
    };
  }

  async getHealthStatus() {
    return await this.healthMonitor.performHealthChecks();
  }

  async getDetailedMetrics() {
    return await this.healthMonitor.getDetailedMetrics();
  }

  getHealthHistory() {
    return this.healthMonitor.getHealthHistory();
  }

  async shutdownAll(): Promise<void> {
    logger.info('REALTIME_GATEWAY_SHUTDOWN_START', {
      activeConnections: this.sessionsBySocket.size,
      activeSessions: this.sessionManager.getActiveSessionCount(),
    });

    // Close all tracked sessions
    const closePromises: Promise<void>[] = [];
    for (const [socket, state] of this.sessionsBySocket) {
      closePromises.push(
        this.cleanupConnection(socket, state).catch(err => {
          logger.error('REALTIME_SHUTDOWN_CLEANUP_ERROR', {
            sessionId: state.sessionId,
            error: String(err),
          });
        })
      );

      try {
        socket.close(1001, 'Server shutting down');
      } catch { /* ignore */ }
    }

    await Promise.allSettled(closePromises);

    // Stop distributed coordination
    sessionCoordinator.stop();
    heartbeatManager.stop();
    sessionWatchdog.stop();

    // Close WebSocket server
    this.wss.close();

    logger.info('REALTIME_GATEWAY_SHUTDOWN_COMPLETE');
  }

  getEventManager() {
    return this.eventManager;
  }

  getMemoryManager() {
    return this.memoryManager;
  }

  getAnalyticsManager() {
    return this.analyticsManager;
  }
}
