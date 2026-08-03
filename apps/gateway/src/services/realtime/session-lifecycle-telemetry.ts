import { logger } from '../logger.js';
import { correlationLogFields } from '../observability/correlation-context.js';

export type SessionLifecycleEvent =
  | 'SESSION_CREATED'
  | 'SESSION_ATTACHED'
  | 'SESSION_REATTACHED'
  | 'SESSION_ACTIVE'
  | 'SESSION_RECONNECTING'
  | 'SESSION_IDLE'
  | 'SESSION_TERMINATING'
  | 'SESSION_TERMINATED'
  | 'SESSION_CLEANED'
  | 'SESSION_RECONNECTED'
  | 'SESSION_PERSISTENCE_FLUSH'
  | 'SESSION_WATCHDOG_CLEANUP';

export function logSessionLifecycle(
  event: SessionLifecycleEvent,
  fields: Record<string, string | number | boolean | undefined> = {}
): void {
  logger.info(event, {
    ...correlationLogFields(),
    ...fields,
  });
}
