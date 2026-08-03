import { logger } from '../logger.js';
import { PipelineLifecycleManager } from './pipeline.lifecycles.js';

// Core orchestrator states
export type OrchestratorState = 'IDLE' | 'USER_SPEAKING' | 'THINKING' | 'AI_SPEAKING' | 'CLOSED';

// Pipeline-scoped revisions to prevent over-cancellation
export interface PipelineRevisions {
  conversationRevision: number;  // Global conversation state
  turnRevision: number;          // Current turn-specific state
}

// Hierarchical ownership structure
export interface Ownership {
  conversationId: string;
  turnId: string;
  responseId: string;
  streamId: string;
  revisions: PipelineRevisions;
}

// Deterministic orchestration events
interface OrchestratorEvent {
  id: string;
  type: string;
  data: any;
  timestamp: number;
  sourceRevision: PipelineRevisions;
  priority: 'high' | 'normal' | 'low';
}

// Event queue for deterministic execution
class DeterministicEventQueue {
  private static readonly MAX_QUEUE_SIZE = 50;
  private highPriorityQueue: OrchestratorEvent[] = [];
  private normalQueue: OrchestratorEvent[] = [];
  private processing = false;
  private eventHandlers = new Map<string, (event: OrchestratorEvent) => void>();

  private get queueLength(): number {
    return this.highPriorityQueue.length + this.normalQueue.length;
  }

  // Enqueue event with priority ordering (O(1) FIFO per priority class)
  enqueue(event: OrchestratorEvent): void {
    if (event.priority === 'high') {
      this.highPriorityQueue.push(event);
    } else {
      this.normalQueue.push(event);
    }

    // Bound the queue: drop the oldest lowest-priority item under burst
    if (this.queueLength > DeterministicEventQueue.MAX_QUEUE_SIZE) {
      const dropped = this.normalQueue.shift();
      logger.warn('EVENT_QUEUE_OVERFLOW', {
        maxSize: DeterministicEventQueue.MAX_QUEUE_SIZE,
        droppedEventId: dropped?.id,
        droppedType: dropped?.type,
        queueLength: this.queueLength
      });
    }

    // Start processing if not active
    if (!this.processing) {
      this.processQueue();
    }

    logger.debug('EVENT_ENQUEUED', {
      eventId: event.id,
      type: event.type,
      priority: event.priority,
      queueLength: this.queueLength
    });
  }
  
  // Register event handler
  on(eventType: string, handler: (event: OrchestratorEvent) => void): void {
    this.eventHandlers.set(eventType, handler);
  }
  
  // Single-threaded deterministic processing
  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queueLength > 0) {
      // Drain high-priority events fully before touching the normal queue
      const event = this.highPriorityQueue.shift() ?? this.normalQueue.shift()!;

      try {
        const startTime = Date.now();

        logger.info('ORCHESTRATOR_EVENT_PROCESSING', {
          eventId: event.id,
          type: event.type,
          sourceRevision: event.sourceRevision,
          queueLength: this.queueLength
        });

        // Process event deterministically
        const handler = this.eventHandlers.get(event.type);
        if (handler) {
          await handler(event);
        }

        const duration = Date.now() - startTime;
        logger.debug('EVENT_PROCESSED', {
          eventId: event.id,
          type: event.type,
          duration,
          queueLength: this.queueLength
        });
        
      } catch (error) {
        logger.error('EVENT_PROCESSING_ERROR', {
          eventId: event.id,
          type: event.type,
          error: String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
      }
    }
    
    this.processing = false;
  }
  
  // Get queue status for monitoring
  getStatus(): { length: number; processing: boolean } {
    return {
      length: this.queueLength,
      processing: this.processing
    };
  }
}

// Core orchestrator with deterministic execution
export class ConversationOrchestrator {
  private currentState: OrchestratorState = 'IDLE';
  private currentRevisions: PipelineRevisions = {
    conversationRevision: 0,
    turnRevision: 0
  };
  
  // Pipeline lifecycle manager for stale propagation
  private lifecycleManager: PipelineLifecycleManager;
  
  // Single authoritative active turn
  private activeTurn: {
    turnId: string;
    ownership: Ownership;
    startTime: number;
  } | null = null;
  
  // Deterministic event queue
  private eventQueue: DeterministicEventQueue;
  
  // Active response tracking
  private activeResponse: {
    responseId: string;
    ownership: Ownership;
    llmAbort?: AbortController;
    ttsAbort?: AbortController;
  } | null = null;
  
  constructor() {
    this.eventQueue = new DeterministicEventQueue();
    this.lifecycleManager = new PipelineLifecycleManager();
    this.setupEventHandlers();
  }
  
  // Setup deterministic event handlers
  private setupEventHandlers(): void {
    this.eventQueue.on('USER_SPEECH_STARTED', this.handleUserSpeechStarted.bind(this));
    this.eventQueue.on('USER_TRANSCRIPT_STABLE', this.handleTranscriptStable.bind(this));
    this.eventQueue.on('USER_SPEECH_ENDED', this.handleUserSpeechEnded.bind(this));
    this.eventQueue.on('INTERRUPT_ACCEPTED', this.handleInterruptAccepted.bind(this));
    this.eventQueue.on('RESPONSE_STALE', this.handleResponseStale.bind(this));
  }
  
  // Enqueue event with current revision
  private enqueueEvent(type: string, data: any, priority: 'high' | 'normal' | 'low' = 'normal'): void {
    const event: OrchestratorEvent = {
      id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      data,
      timestamp: Date.now(),
      sourceRevision: { ...this.currentRevisions },
      priority
    };
    
    this.eventQueue.enqueue(event);
  }
  
  // Deterministic state transition
  private transitionTo(newState: OrchestratorState, reason: string): boolean {
    const validTransitions: Record<OrchestratorState, OrchestratorState[]> = {
      'IDLE': ['USER_SPEAKING'],
      'USER_SPEAKING': ['THINKING', 'IDLE'],
      'THINKING': ['AI_SPEAKING', 'USER_SPEAKING'],
      'AI_SPEAKING': ['USER_SPEAKING', 'IDLE'],
      'CLOSED': []
    };
    
    const allowedStates = validTransitions[this.currentState];
    if (!allowedStates.includes(newState)) {
      logger.warn('INVALID_STATE_TRANSITION', {
        from: this.currentState,
        to: newState,
        reason,
        allowed: allowedStates
      });
      return false;
    }
    
    const oldState = this.currentState;
    this.currentState = newState;
    
    logger.info('ORCHESTRATOR_STATE_CHANGE', {
      from: oldState,
      to: newState,
      reason,
      conversationRevision: this.currentRevisions.conversationRevision,
      turnRevision: this.currentRevisions.turnRevision,
      timestamp: Date.now()
    });
    
    return true;
  }
  
  // Revision verification for async operations
  private verifyRevisions(expectedRevisions: PipelineRevisions): boolean {
    const isValid = 
      this.currentRevisions.conversationRevision === expectedRevisions.conversationRevision &&
      this.currentRevisions.turnRevision === expectedRevisions.turnRevision;
    
    if (!isValid) {
      logger.info('REVISION_MISMATCH', {
        expected: expectedRevisions,
        current: this.currentRevisions,
        timestamp: Date.now()
      });
    }
    
    return isValid;
  }
  
  // Increment turn revision
  private incrementTurnRevision(): PipelineRevisions {
    this.currentRevisions.turnRevision++;
    return { ...this.currentRevisions };
  }
  
  // Increment conversation revision (resets turn revision)
  private incrementConversationRevision(): PipelineRevisions {
    this.currentRevisions.conversationRevision++;
    this.currentRevisions.turnRevision = 0;
    return { ...this.currentRevisions };
  }
  
  // Event handlers (deterministic execution)
  private async handleUserSpeechStarted(event: OrchestratorEvent): Promise<void> {
    if (!this.verifyRevisions(event.sourceRevision)) return;
    
    const { turnId, conversationId } = event.data;
    
    // Authoritative turn ownership - invalidate previous turn
    if (this.activeTurn) {
      logger.info('TURN_INVALIDATED', {
        previousTurnId: this.activeTurn.turnId,
        newTurnId: turnId,
        reason: 'new_user_speech'
      });
      
      // Propagate stale to all pipelines from previous turn
      this.propagateStaleToTurn(this.activeTurn.turnId, 'new_turn_started');
    }
    
    // Establish new active turn
    const ownership: Ownership = {
      conversationId,
      turnId,
      responseId: `resp_${Date.now()}`,
      streamId: `stream_${Date.now()}`,
      revisions: this.incrementTurnRevision()
    };
    
    this.activeTurn = {
      turnId,
      ownership,
      startTime: Date.now()
    };
    
    this.transitionTo('USER_SPEAKING', 'user_speech_started');
    
    logger.info('TURN_ESTABLISHED', {
      turnId,
      conversationRevision: ownership.revisions.conversationRevision,
      turnRevision: ownership.revisions.turnRevision
    });
  }
  
  private async handleTranscriptStable(event: OrchestratorEvent): Promise<void> {
    if (!this.verifyRevisions(event.sourceRevision)) return;
    
    if (!this.activeTurn) {
      logger.warn('TRANSCRIPT_STABLE_NO_ACTIVE_TURN', { eventId: event.id });
      return;
    }
    
    const { transcript, stability } = event.data;
    
    // Critical: Accept stable interim transcript, NOT wait for finals
    if (!this.transitionTo('THINKING', 'transcript_stable')) {
      return;
    }
    
    logger.info('TRANSCRIPT_STABLE_ACCEPTED', {
      transcript: transcript.substring(0, 50),
      stability,
      turnId: this.activeTurn.turnId,
      turnRevision: this.currentRevisions.turnRevision,
      latency: Date.now() - event.timestamp
    });
    
    // Emit LLM generation request immediately
    this.enqueueEvent('LLM_GENERATION_REQUESTED', {
      transcript,
      turnId: this.activeTurn.turnId,
      ownership: this.activeTurn.ownership
    }, 'high');
  }
  
  private async handleUserSpeechEnded(event: OrchestratorEvent): Promise<void> {
    if (!this.verifyRevisions(event.sourceRevision)) return;
    
    if (this.currentState === 'USER_SPEAKING') {
      this.transitionTo('IDLE', 'user_speech_ended');
    }
    
    logger.info('USER_SPEECH_ENDED', {
      turnId: this.activeTurn?.turnId,
      timestamp: Date.now()
    });
  }
  
  private async handleInterruptAccepted(event: OrchestratorEvent): Promise<void> {
    if (!this.verifyRevisions(event.sourceRevision)) return;
    
    // High priority - immediate processing
    if (this.activeTurn) {
      this.propagateStaleToTurn(this.activeTurn.turnId, 'interrupt_accepted');
    }
    
    // Transition to user speaking
    this.transitionTo('USER_SPEAKING', 'interrupt_accepted');
    
    logger.info('INTERRUPT_ACCEPTED', {
      reason: event.data.reason,
      timestamp: Date.now()
    });
  }
  
  private async handleResponseStale(event: OrchestratorEvent): Promise<void> {
    if (!this.verifyRevisions(event.sourceRevision)) return;
    
    const { reason } = event.data;
    
    // Cancel active response with ownership verification
    if (this.activeResponse) {
      this.activeResponse.llmAbort?.abort();
      this.activeResponse.ttsAbort?.abort();
      
      logger.info('RESPONSE_CANCELLED', {
        responseId: this.activeResponse.responseId,
        reason,
        turnRevision: this.activeResponse.ownership.revisions.turnRevision,
        timestamp: Date.now()
      });
      
      this.activeResponse = null;
    }
  }
  
  // Mark current response as stale
  private markResponseStale(reason: string): void {
    this.enqueueEvent('RESPONSE_STALE', { reason }, 'high');
  }
  
  // Pipeline lifecycle management APIs
  public registerPipeline(pipelineId: string, abortController?: AbortController): boolean {
    if (!this.activeTurn) return false;
    
    this.lifecycleManager.registerPipeline(
      pipelineId,
      this.activeTurn.ownership,
      abortController
    );
    
    return true;
  }
  
  public completePipeline(pipelineId: string): void {
    this.lifecycleManager.completePipeline(pipelineId);
  }
  
  public propagateStaleToTurn(turnId: string, reason: string): void {
    this.lifecycleManager.propagateStale(
      turnId,
      reason,
      this.currentRevisions
    );
  }
  
  public propagateStaleToAll(reason: string): void {
    this.lifecycleManager.propagateStaleAll(reason);
  }
  
  public isPipelineActive(pipelineId: string): boolean {
    return this.lifecycleManager.isPipelineActive(pipelineId);
  }
  
  public getPipelineOwnership(pipelineId: string): Ownership | null {
    return this.lifecycleManager.getPipelineOwnership(pipelineId);
  }
  
  // Ownership verification for pipelines
  public verifyTurnOwnership(turnId: string, conversationId: string): boolean {
    return this.activeTurn !== null &&
           this.activeTurn.turnId === turnId &&
           this.activeTurn.ownership.conversationId === conversationId;
  }
  
  public getCurrentOwnership(): Ownership | null {
    return this.activeTurn?.ownership || null;
  }
  
  public getCurrentTurnId(): string | null {
    return this.activeTurn?.turnId || null;
  }
  
  // Active response lifecycle management
  public setActiveResponse(responseId: string, llmAbort?: AbortController, ttsAbort?: AbortController): boolean {
    if (!this.activeTurn) return false;
    
    // Cancel any existing response first
    if (this.activeResponse) {
      this.markResponseStale('new_response_set');
    }
    
    this.activeResponse = {
      responseId,
      ownership: this.activeTurn.ownership,
      llmAbort,
      ttsAbort
    };
    
    logger.info('RESPONSE_ACTIVATED', {
      responseId,
      turnId: this.activeTurn.turnId,
      turnRevision: this.activeTurn.ownership.revisions.turnRevision
    });
    
    return true;
  }
  
  public cancelActiveResponse(reason: string): boolean {
    if (!this.activeResponse) return false;
    
    const responseId = this.activeResponse.responseId;
    this.activeResponse.llmAbort?.abort();
    this.activeResponse.ttsAbort?.abort();
    
    logger.info('RESPONSE_CANCELLED', {
      responseId,
      reason,
      turnRevision: this.activeResponse.ownership.revisions.turnRevision,
      timestamp: Date.now()
    });
    
    this.activeResponse = null;
    return true;
  }
  
  public hasActiveResponse(): boolean {
    return this.activeResponse !== null;
  }
  
  // Public API for pipelines (enqueue only)
  public userSpeechStarted(turnId: string, conversationId: string): void {
    this.enqueueEvent('USER_SPEECH_STARTED', { turnId, conversationId }, 'high');
  }
  
  public transcriptStable(transcript: string, stability: number): void {
    this.enqueueEvent('USER_TRANSCRIPT_STABLE', { transcript, stability }, 'high');
  }
  
  public userSpeechEnded(): void {
    this.enqueueEvent('USER_SPEECH_ENDED', {}, 'normal');
  }
  
  public interruptAccepted(reason: string): void {
    this.enqueueEvent('INTERRUPT_ACCEPTED', { reason }, 'high');
  }
  
  // Get current state for monitoring
  public getState(): {
    currentState: OrchestratorState;
    revisions: PipelineRevisions;
    activeTurn: { turnId: string; startTime: number } | null;
    queueStatus: { length: number; processing: boolean };
  } {
    return {
      currentState: this.currentState,
      revisions: { ...this.currentRevisions },
      activeTurn: this.activeTurn ? {
        turnId: this.activeTurn.turnId,
        startTime: this.activeTurn.startTime
      } : null,
      queueStatus: this.eventQueue.getStatus()
    };
  }
  
  // Cleanup
  public close(): void {
    this.transitionTo('CLOSED', 'orchestrator_shutdown');
    
    // Propagate stale to all pipelines
    this.propagateStaleToAll('orchestrator_closed');
    
    logger.info('ORCHESTRATOR_CLOSED', {
      finalState: this.currentState,
      finalRevisions: this.currentRevisions,
      timestamp: Date.now()
    });
  }
}
