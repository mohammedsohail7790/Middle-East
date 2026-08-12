/**
 * Slack notifications — skeleton stub.
 * Slack workspace integration was removed for the Halla AI skeleton; these calls
 * are accepted and no-op'd so the calling code (post-call, leads, appointments) doesn't branch on it.
 */

export const slackService = {
  async sendNewCallNotification(_tenantId: string, _payload: Record<string, unknown>): Promise<void> {},
  async sendAppointmentBookedNotification(_tenantId: string, _payload: Record<string, unknown>): Promise<void> {},
  async sendNewLeadNotification(_tenantId: string, _payload: Record<string, unknown>): Promise<void> {},
};
