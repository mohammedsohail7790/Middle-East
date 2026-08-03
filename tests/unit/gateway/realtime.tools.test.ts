import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RealtimeToolsManager } from '../../../apps/gateway/src/services/realtime/realtime.tools.js';
import type { RealtimeSession } from '../../../apps/gateway/src/services/realtime/realtime.types.js';

vi.mock('../../../apps/gateway/src/services/appointments/appointment.service.js', () => ({
  appointmentService: {
    createAppointment: vi.fn(),
    rescheduleAppointment: vi.fn(),
    cancelAppointment: vi.fn(),
    checkAvailability: vi.fn(),
  },
}));

vi.mock('../../../apps/gateway/src/services/integrations/integration.service.js', () => ({
  integrationService: {
    send: vi.fn().mockResolvedValue(undefined),
    sendRealtime: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../apps/gateway/src/services/knowledge/knowledge.service.js', () => ({
  knowledgeService: {
    searchRelevantKnowledge: vi.fn(),
  },
}));

vi.mock('../../../apps/gateway/src/services/voice/transfer.service.js', () => ({
  transferService: {
    transferCall: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../apps/gateway/src/services/voice/tenant-scope.js', () => ({
  voiceDb: {
    query: vi.fn(),
  },
}));

vi.mock('../../../apps/gateway/src/services/voice/voice.controller.js', () => ({
  storeLead: vi.fn().mockResolvedValue(undefined),
  resolveCallIdForLead: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../apps/gateway/src/services/leads/leads.service.js', () => ({
  leadsService: {
    createLead: vi.fn().mockResolvedValue({ id: 'lead-1' }),
  },
}));

vi.mock('../../../apps/gateway/src/services/realtime/realtime.memory.js', () => ({
  RealtimeMemoryManager: class {
    storeCustomerInfo = vi.fn().mockResolvedValue(undefined);
    storeIntent = vi.fn().mockResolvedValue(undefined);
    storeEntity = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock('../../../apps/gateway/src/services/ai-governance/ai-governance.service.js', () => ({
  aiGovernanceService: {
    executeMediatedTool: vi.fn((_fn: () => Promise<unknown>) => _fn()),
  },
}));

vi.mock('../../../apps/gateway/src/services/realtime/session-idempotency.js', () => ({
  shouldExecuteTool: vi.fn(() => true),
  nextTransportGeneration: vi.fn((_sessionId: string, current: number) => current + 1),
  transportAttachKey: vi.fn(
    (sessionId: string, wsSessionId: string, generation: number) =>
      `${sessionId}:${wsSessionId}:${generation}`
  ),
  markTransportAttachOnce: vi.fn(() => true),
  clearTransportAttachKeysForSession: vi.fn(),
  reconnectSequenceId: vi.fn(
    (callSid: string, reconnectCount: number) => `${callSid}:r${reconnectCount}`
  ),
}));

vi.mock('twilio', () => {
  const mockMessages = { create: vi.fn().mockResolvedValue({ sid: 'SM123' }) };
  return { default: vi.fn(() => ({ messages: mockMessages })) };
});

import { appointmentService } from '../../../apps/gateway/src/services/appointments/appointment.service.js';
import { voiceDb } from '../../../apps/gateway/src/services/voice/tenant-scope.js';

function makeSession(overrides?: Partial<RealtimeSession>): RealtimeSession {
  return {
    id: 'sess-1', tenantId: 'tenant-1', callSid: 'call-1', streamSid: 'stream-1',
    openAiWs: null, twilioWs: null, startTime: new Date(), lastActivity: new Date(), isActive: true,
    config: {
      tenantId: 'tenant-1', callSid: 'call-1', streamSid: 'stream-1',
      language: 'en', voice: 'alloy', instructions: '', tools: [], temperature: 0.7,
    }, ...overrides,
  };
}

describe('RealtimeToolsManager', () => {
  let mgr: RealtimeToolsManager;
  let session: RealtimeSession;

  beforeEach(() => { vi.clearAllMocks(); mgr = new RealtimeToolsManager(); session = makeSession(); });

  describe('create_appointment', () => {
    it('creates appointment successfully', async () => {
      (appointmentService.createAppointment as any).mockResolvedValue({ success: true, appointmentId: 'apt-1', scheduledTime: '2026-05-14T10:00:00Z', message: 'Confirmed' });
      const r = await mgr.executeTool(session, 'create_appointment', { customer_name: 'John', phone: '+15551112222', issue: 'AC Repair', preferred_time: '2026-05-14T10:00:00Z' });
      expect(r.success).toBe(true); expect(r.data?.appointmentId).toBe('apt-1');
    });

    it('returns alternative when time taken', async () => {
      (appointmentService.createAppointment as any).mockResolvedValue({ success: false, alternativeTime: '2026-05-14T14:00:00Z', message: 'Not available' });
      const r = await mgr.executeTool(session, 'create_appointment', { customer_name: 'John', phone: '+15551112222' });
      expect(r.success).toBe(false);
      expect(r.data?.alternativeTime).toBeTruthy();
    });

    it('handles errors gracefully', async () => {
      (appointmentService.createAppointment as any).mockRejectedValue(new Error('DB error'));
      const r = await mgr.executeTool(session, 'create_appointment', { customer_name: 'John', phone: '+15551112222' });
      expect(r.success).toBe(false); expect(r.error).toContain('Failed to create appointment');
    });
  });

  describe('transfer_call', () => {
    it('transfers with valid number', async () => {
      (voiceDb.query as any).mockResolvedValue({ rows: [{ transfer_phone_number: '+15553334444' }] });
      const r = await mgr.executeTool(session, 'transfer_call', { reason: 'Need human', department: 'support' });
      expect(r.success).toBe(true);
    });

    it('fails without transfer number', async () => {
      (voiceDb.query as any).mockResolvedValue({ rows: [] });
      const r = await mgr.executeTool(session, 'transfer_call', { reason: 'Escalation' });
      expect(r.success).toBe(false); expect(r.error).toContain('No transfer number');
    });
  });

  describe('lookup_customer', () => {
    it('finds by phone', async () => {
      (voiceDb.query as any).mockResolvedValue({ rows: [{ id: 'lead-1', name: 'John', phone: '+15551112222' }] });
      const r = await mgr.executeTool(session, 'lookup_customer', { phone: '+15551112222' });
      expect(r.success).toBe(true); expect(r.data.length).toBe(1);
    });

    it('no results returns null', async () => {
      (voiceDb.query as any).mockResolvedValue({ rows: [] });
      const r = await mgr.executeTool(session, 'lookup_customer', { phone: '+15551112222' });
      expect(r.success).toBe(true); expect(r.data).toBeNull();
    });

    it('fails with no criteria', async () => {
      const r = await mgr.executeTool(session, 'lookup_customer', {});
      expect(r.success).toBe(false); expect(r.error).toContain('No search criteria');
    });
  });

  describe('update_customer', () => {
    it('updates specified fields', async () => {
      (voiceDb.query as any).mockResolvedValue({ rows: [] });
      const r = await mgr.executeTool(session, 'update_customer', { customer_id: 'lead-1', updates: { name: 'Jane' } });
      expect(r.success).toBe(true);
    });

    it('no-update on empty fields', async () => {
      const r = await mgr.executeTool(session, 'update_customer', { customer_id: 'lead-1', updates: {} });
      expect(r.success).toBe(true); expect(r.message).toContain('No fields');
    });
  });

  describe('search_knowledge_base', () => {
    it('returns formatted results', async () => {
      const { knowledgeService } = await import('../../../apps/gateway/src/services/knowledge/knowledge.service.js');
      (knowledgeService.searchRelevantKnowledge as any).mockResolvedValue([{ content: 'Answer', category: 'FAQ' }]);
      const r = await mgr.executeTool(session, 'search_knowledge_base', { query: 'pricing' });
      expect(r.success).toBe(true); expect(r.data.length).toBe(1);
    });

    it('empty results', async () => {
      const { knowledgeService } = await import('../../../apps/gateway/src/services/knowledge/knowledge.service.js');
      (knowledgeService.searchRelevantKnowledge as any).mockResolvedValue([]);
      const r = await mgr.executeTool(session, 'search_knowledge_base', { query: 'unknown' });
      expect(r.success).toBe(true); expect(r.data).toEqual([]);
    });
  });

  describe('cancel_appointment', () => {
    it('cancels via appointment service', async () => {
      const { appointmentService } = await import('../../../apps/gateway/src/services/appointments/appointment.service.js');
      (appointmentService.cancelAppointment as any).mockResolvedValue({
        success: true,
        message: 'Appointment cancelled.',
        appointmentId: 'apt-1',
      });
      const r = await mgr.executeTool(session, 'cancel_appointment', { appointment_id: 'apt-1', reason: 'No longer needed' });
      expect(r.success).toBe(true);
      expect(appointmentService.cancelAppointment).toHaveBeenCalledWith(
        'tenant-1',
        'apt-1',
        'No longer needed'
      );
    });
  });

  describe('send_sms', () => {
    it('sends via twilio', async () => {
      (voiceDb.query as any).mockResolvedValue({
        rows: [{ from_number: '+15550009999' }],
      });
      const r = await mgr.executeTool(session, 'send_sms', { phone: '+15551112222', message: 'Hello' });
      expect(r.success).toBe(true);
    });
  });

  describe('unknown tool', () => {
    it('returns error for unknown tool', async () => {
      const r = await mgr.executeTool(session, 'nonexistent_tool', {});
      expect(r.success).toBe(false); expect(r.error).toContain('Unknown tool');
    });
  });

  describe('create_lead', () => {
    it('creates lead and dispatches integration', async () => {
      const r = await mgr.executeTool(session, 'create_lead', { name: 'John', phone: '+15551112222', interest: 'HVAC' });
      expect(r.success).toBe(true);
    });
  });
});
