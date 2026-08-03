import type { PlatformEvent } from './event-envelope.js';

const ENVELOPE_FIELD = 'envelope';

export function encodeEventEnvelope(event: PlatformEvent): Record<string, string> {
  return {
    [ENVELOPE_FIELD]: JSON.stringify(event),
    eventId: event.eventId,
    eventType: event.eventType,
    tenantId: event.tenantId,
    occurredAt: event.occurredAt,
  };
}

export function decodeEventEnvelope(fields: string[]): PlatformEvent | null {
  const map: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) {
    map[fields[i]] = fields[i + 1];
  }
  const raw = map.envelope;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlatformEvent;
  } catch {
    return null;
  }
}
