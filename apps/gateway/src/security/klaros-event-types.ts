/**
 * External event vocabulary exposed to Klaros over the custom-webhooks
 * contract. Validated server-side on webhook registration (item 10) and on
 * dispatch (item 5) — arbitrary event names are never accepted.
 */
import { InputValidationError } from './input-validation-error.js';

export const KLAROS_EVENT_TYPES = [
  'call.started',
  'call.completed',
  'lead.created',
  'lead.updated',
  'lead.qualified',
  'lead.escalated',
  'appointment.requested',
  'appointment.confirmed',
  'appointment.rescheduled',
  'appointment.cancelled',
] as const;

export type KlarosEventType = (typeof KLAROS_EVENT_TYPES)[number];

const KLAROS_EVENT_TYPE_SET = new Set<string>(KLAROS_EVENT_TYPES);

export function isKlarosEventType(value: string): value is KlarosEventType {
  return KLAROS_EVENT_TYPE_SET.has(value);
}

/** Validates a webhook's requested event list; throws on any unknown event name. */
export function assertValidKlarosEvents(events: string[]): void {
  const invalid = events.filter((e) => !isKlarosEventType(e));
  if (invalid.length > 0) {
    throw new InputValidationError(`Unknown event type(s): ${invalid.join(', ')}`);
  }
}
