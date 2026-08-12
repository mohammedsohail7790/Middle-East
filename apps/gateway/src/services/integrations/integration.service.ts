/**
 * Integration service — skeleton stub.
 * CRM/calendar/webhook integrations were removed for the Halla AI skeleton.
 * Calls to sync leads/appointments to a third-party CRM are accepted and
 * no-op'd here; reintroduce a real provider integration when needed.
 */

export const integrationService = {
  async sendRealtime(_tenantId: string, _payload: Record<string, unknown>): Promise<void> {
    // No-op — no CRM integrations configured in the skeleton.
  },

  async retryDeadLetterJob(_jobId: string): Promise<boolean> {
    return false;
  },
};
