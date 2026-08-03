import type { Redis } from 'ioredis';
import { logger } from '../logger.js';

const REDIS_CHANNEL = 'calliq:events';

export type EventType =
    | 'CALL_STARTED'
    | 'CALL_COMPLETED'
    | 'CALL_FAILED'
    | 'BOOKING_CREATED'
    | 'BOOKING_CANCELLED'
    | 'LEAD_CAPTURED'
    | 'LEAD_UPDATED'
    | 'ESCALATION_TRIGGERED'
    | 'PAYMENT_FAILED'
    | 'PAYMENT_SUCCEEDED'
    | 'SMS_RECEIVED'
    | 'SMS_SENT'
    | 'VOICEMAIL_LEFT'
    | 'MISSED_CALL'
    | 'APPOINTMENT_REMINDER'
    | 'FOLLOWUP_SCHEDULED'
    | 'TRIAL_EXPIRING'
    | 'USAGE_LIMIT_REACHED'
    | 'KNOWLEDGE_INGESTED'
    | 'INTEGRATION_FAILED'
    | 'COST_ANOMALY';

export interface EventPayload {
    type: EventType;
    tenantId: string;
    timestamp: number;
    data: Record<string, any>;
    metadata?: {
        correlationId?: string;
        source?: string;
        priority?: 'low' | 'normal' | 'high' | 'critical';
    };
}

type EventHandler = (event: EventPayload) => Promise<void> | void;

interface HandlerRegistration {
    handler: EventHandler;
    filter?: (event: EventPayload) => boolean;
    description?: string;
}

export class EventBus {
    private handlers = new Map<EventType, HandlerRegistration[]>();
    private history: EventPayload[] = [];
    private readonly maxHistory = 1000;
    private isDraining = false;
    private redis: Redis | null = null;
    private subscriber: Redis | null = null;
    private messageHandler: ((channel: string, message: string) => void) | null = null;

    subscribe(
        eventType: EventType,
        handler: EventHandler,
        options?: { filter?: (event: EventPayload) => boolean; description?: string }
    ): () => void {
        if (!this.handlers.has(eventType)) {
            this.handlers.set(eventType, []);
        }

        const registration: HandlerRegistration = {
            handler,
            filter: options?.filter,
            description: options?.description,
        };

        this.handlers.get(eventType)!.push(registration);

        logger.debug('EVENT_BUS_SUBSCRIBED', {
            eventType,
            description: options?.description,
            totalHandlers: this.handlers.get(eventType)!.length,
        });

        return () => {
            const handlers = this.handlers.get(eventType);
            if (handlers) {
                const idx = handlers.indexOf(registration);
                if (idx >= 0) handlers.splice(idx, 1);
            }
        };
    }

    async publish(event: EventPayload, options?: { fromRedis?: boolean }): Promise<void> {
        if (this.isDraining) {
            logger.warn('EVENT_BUS_DRAINING', { eventType: event.type });
            return;
        }

        event.timestamp = event.timestamp || Date.now();

        // Fan out to other instances. Events arriving from Redis are not
        // re-published, otherwise they would loop between instances forever.
        if (this.redis && !options?.fromRedis) {
            try {
                await this.redis.publish(REDIS_CHANNEL, JSON.stringify(event));
            } catch (err) {
                logger.error('EVENT_BUS_REDIS_PUBLISH_FAILED', {
                    eventType: event.type,
                    error: String(err),
                });
            }
        }

        this.history.push(event);
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }

        const handlers = this.handlers.get(event.type);
        if (!handlers || handlers.length === 0) {
            logger.debug('EVENT_BUS_NO_HANDLERS', {
                eventType: event.type,
                tenantId: event.tenantId,
            });
            return;
        }

        const filtered = handlers.filter(h => !h.filter || h.filter(event));

        logger.debug('EVENT_BUS_PUBLISH', {
            eventType: event.type,
            tenantId: event.tenantId,
            handlersCount: filtered.length,
        });

        const results = await Promise.allSettled(
            filtered.map(h =>
                Promise.resolve(h.handler(event)).catch(err => ({
                    handler: h.description || 'anonymous',
                    error: String(err),
                }))
            )
        );

        for (const result of results) {
            if (result.status === 'rejected') {
                logger.error('EVENT_BUS_HANDLER_FAILED', {
                    eventType: event.type,
                    error: result.reason,
                });
            }
        }
    }

    subscribeToMany(
        eventTypes: EventType[],
        handler: EventHandler,
        description?: string
    ): () => void {
        const unsubscribes = eventTypes.map(t =>
            this.subscribe(t, handler, { description })
        );
        return () => unsubscribes.forEach(u => u());
    }

    subscribeToAll(handler: EventHandler, description?: string): () => void {
        const eventTypes: EventType[] = [
            'CALL_STARTED', 'CALL_COMPLETED', 'CALL_FAILED',
            'BOOKING_CREATED', 'BOOKING_CANCELLED',
            'LEAD_CAPTURED', 'LEAD_UPDATED',
            'ESCALATION_TRIGGERED',
            'PAYMENT_FAILED', 'PAYMENT_SUCCEEDED',
            'SMS_RECEIVED', 'SMS_SENT',
            'MISSED_CALL',
            'USAGE_LIMIT_REACHED',
            'INTEGRATION_FAILED',
            'COST_ANOMALY',
        ];
        return this.subscribeToMany(eventTypes, handler, description);
    }

    getHandlers(eventType: EventType): number {
        return this.handlers.get(eventType)?.length || 0;
    }

    getHistory(limit: number = 50): EventPayload[] {
        return this.history.slice(-limit);
    }

    getStats(): { totalEvents: number; handlersByType: Record<string, number> } {
        const handlersByType: Record<string, number> = {};
        for (const [type, handlers] of this.handlers) {
            handlersByType[type] = handlers.length;
        }
        return {
            totalEvents: this.history.length,
            handlersByType,
        };
    }

    /**
     * Opt-in multi-instance backing. `publisher` is used to broadcast locally
     * published events; `subscriber` (a separate connection, since a Redis
     * client in subscribe mode cannot issue other commands) receives events
     * from peers and dispatches them to local handlers.
     */
    connectRedis(redis: Redis, subscriber: Redis): void {
        this.redis = redis;
        this.subscriber = subscriber;

        this.messageHandler = (channel: string, message: string) => {
            if (channel !== REDIS_CHANNEL) return;
            try {
                const event = JSON.parse(message) as EventPayload;
                // Dispatch locally only — do not re-publish back to Redis.
                void this.publish(event, { fromRedis: true });
            } catch (err) {
                logger.error('EVENT_BUS_REDIS_PARSE_FAILED', { error: String(err) });
            }
        };

        this.subscriber.on('message', this.messageHandler);
        this.subscriber.subscribe(REDIS_CHANNEL).catch((err) => {
            logger.error('EVENT_BUS_REDIS_SUBSCRIBE_FAILED', { error: String(err) });
        });

        logger.info('EVENT_BUS_REDIS_CONNECTED', { channel: REDIS_CHANNEL });
    }

    disconnect(): void {
        if (this.subscriber) {
            if (this.messageHandler) {
                this.subscriber.off('message', this.messageHandler);
            }
            this.subscriber.unsubscribe(REDIS_CHANNEL).catch((err) => {
                logger.error('EVENT_BUS_REDIS_UNSUBSCRIBE_FAILED', { error: String(err) });
            });
        }
        this.redis = null;
        this.subscriber = null;
        this.messageHandler = null;
        logger.info('EVENT_BUS_REDIS_DISCONNECTED');
    }

    drain(): void {
        this.isDraining = true;
        this.handlers.clear();
        logger.info('EVENT_BUS_DRAINED');
    }
}

export const eventBus = new EventBus();
