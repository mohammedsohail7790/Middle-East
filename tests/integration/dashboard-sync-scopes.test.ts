import { describe, it, expect } from 'vitest';
import {
  scopesFromMetricsDelta,
  scopesFromPushEvent,
} from '../../apps/dashboard/src/lib/dashboard-sync';
import {
  scopesForPushType,
  type DashboardPushType,
} from '../../apps/gateway/src/services/dashboard/dashboard-events';

describe('dashboard realtime scope mapping', () => {
  const allPushTypes: DashboardPushType[] = [
    'call.started',
    'call.ended',
    'call.updated',
    'sms.inbound',
    'sms.outbound',
    'lead.created',
    'lead.updated',
    'calendar.updated',
    'billing.updated',
    'knowledge.updated',
    'config.updated',
    'phone.updated',
    'integrations.updated',
  ];

  it('maps every gateway push type to at least one dashboard scope', () => {
    for (const type of allPushTypes) {
      const scopes = scopesForPushType(type);
      expect(scopes.length, type).toBeGreaterThan(0);
      expect(scopesFromPushEvent(scopes).length, type).toBeGreaterThan(0);
    }
  });

  it('detects call count changes from SSE metrics delta', () => {
    const prev = {
      timestamp: '',
      activeCalls: 0,
      liveCalls: [],
      totalCalls: 10,
      completedCalls: 8,
      callsToday: 2,
      totalLeads: 5,
      leadsToday: 1,
    };
    const next = { ...prev, totalCalls: 11, callsToday: 3 };
    const scopes = scopesFromMetricsDelta(prev, next);
    expect(scopes).toContain('calls');
    expect(scopes).toContain('metrics');
    expect(scopes).toContain('analytics');
  });

  it('detects active call drop and refreshes calendar', () => {
    const prev = {
      timestamp: '',
      activeCalls: 1,
      liveCalls: [],
      totalCalls: 10,
      completedCalls: 8,
      callsToday: 2,
      totalLeads: 5,
      leadsToday: 1,
    };
    const next = { ...prev, activeCalls: 0 };
    const scopes = scopesFromMetricsDelta(prev, next);
    expect(scopes).toContain('calls');
    expect(scopes).toContain('calendar');
  });

  it('honours server-provided changed scopes on metrics payload', () => {
    const prev = {
      timestamp: '',
      activeCalls: 0,
      liveCalls: [],
      totalCalls: 1,
      completedCalls: 1,
      callsToday: 1,
      totalLeads: 1,
      leadsToday: 1,
    };
    const next = {
      ...prev,
      changed: ['sms', 'billing'],
    };
    const scopes = scopesFromMetricsDelta(prev, next);
    expect(scopes).toContain('sms');
    expect(scopes).toContain('billing');
  });
});
