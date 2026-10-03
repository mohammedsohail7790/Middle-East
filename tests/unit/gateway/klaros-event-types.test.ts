import { describe, it, expect } from 'vitest';
import {
  isKlarosEventType,
  assertValidKlarosEvents,
  KLAROS_EVENT_TYPES,
} from '../../../apps/gateway/src/security/klaros-event-types.js';

describe('klaros event type validation', () => {
  it('accepts every documented event type', () => {
    for (const type of KLAROS_EVENT_TYPES) {
      expect(isKlarosEventType(type)).toBe(true);
    }
  });

  it('rejects an unknown event type', () => {
    expect(isKlarosEventType('lead.exploded')).toBe(false);
  });

  it('allows registering a webhook with only valid event types', () => {
    expect(() => assertValidKlarosEvents(['call.completed', 'lead.qualified'])).not.toThrow();
  });

  it('rejects registering a webhook with an arbitrary event name', () => {
    expect(() => assertValidKlarosEvents(['call.completed', 'totally_made_up'])).toThrow(
      /Unknown event type/
    );
  });

  it('rejects an empty-string event type', () => {
    expect(() => assertValidKlarosEvents([''])).toThrow();
  });
});
