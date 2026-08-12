/**
 * Calendly integration — skeleton stub.
 * No external calendar sync in the skeleton; getConnection() always resolves
 * null so callers fall through to internal-only appointment booking.
 */

export const calendlyService = {
  async getConnection(_tenantId: string): Promise<Record<string, unknown> | null> {
    return null;
  },

  async getEventTypes(_tenantId: string): Promise<Array<{ id?: string; uri?: string }>> {
    return [];
  },

  async createInviteLink(_tenantId: string, _eventTypeId: string, _isoStartTime: string): Promise<string | null> {
    return null;
  },

  async handleWebhookPayload(_tenantId: string, _payload: Record<string, unknown>): Promise<void> {},
};
