import type { PlatformEventType } from './event-types.js';
import { streamKey, type EventStreamName } from './event-types.js';

const ROUTES: Record<PlatformEventType, EventStreamName> = {
  CALL_STARTED: 'call-events',
  CALL_CONNECTED: 'call-events',
  CALL_TRANSCRIPT_UPDATED: 'call-events',
  CALL_SUMMARY_GENERATED: 'call-events',
  CALL_ENDED: 'call-events',

  SESSION_CREATED: 'call-events',
  SESSION_REATTACHED: 'call-events',
  SESSION_TERMINATED: 'call-events',
  SESSION_WATCHDOG_CLEANUP: 'call-events',

  LEAD_CREATED: 'lead-events',
  LEAD_UPDATED: 'lead-events',

  APPOINTMENT_CREATED: 'appointment-events',
  APPOINTMENT_RESCHEDULED: 'appointment-events',
  APPOINTMENT_CANCELLED: 'appointment-events',

  SMS_SENT: 'automation-events',
  AUTOMATION_TRIGGERED: 'automation-events',

  CRM_SYNC_REQUESTED: 'integration-events',
  CRM_SYNC_COMPLETED: 'integration-events',
  CRM_SYNC_FAILED: 'integration-events',

  TOOL_EXECUTED: 'analytics-events',
  TOOL_SKIPPED_IDEMPOTENT: 'analytics-events',
  AI_RUNTIME_WARNING: 'analytics-events',
  AI_TOOL_AUTHORIZED: 'analytics-events',
  AI_TOOL_DENIED: 'analytics-events',
  AI_TOOL_EXECUTED: 'analytics-events',
  AI_TOOL_FAILED: 'analytics-events',
  AI_RUNTIME_POLICY_VIOLATION: 'analytics-events',
  AI_RUNTIME_GUARDRAIL_TRIGGERED: 'analytics-events',
};

export function routeEventToStream(eventType: PlatformEventType): string {
  const name = ROUTES[eventType] || 'analytics-events';
  return streamKey(name);
}

export function allPlatformStreams(): string[] {
  const names = new Set(Object.values(ROUTES));
  return [...names].map((n) => streamKey(n));
}
