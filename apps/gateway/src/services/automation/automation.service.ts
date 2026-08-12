/**
 * Automation service — skeleton stub.
 * SMS/CRM automation workflows were removed for the Halla AI skeleton; these calls
 * are accepted and no-op'd so the calling code (post-call, tools) doesn't branch on it.
 */

export const automationService = {
  async sendCallFollowUp(_tenantId: string, _callSid: string, _phone: string): Promise<void> {},
  async sendAppointmentConfirmation(_tenantId: string, _appointmentId: string): Promise<void> {},
  async triggerLeadCreated(_tenantId: string, _lead: Record<string, unknown>): Promise<void> {},
};
