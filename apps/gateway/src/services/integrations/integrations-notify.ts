/** Notify dashboard SSE clients that integration state changed. */
export function publishIntegrationsUpdated(tenantId: string, provider: string): void {
  void import('../dashboard/dashboard-events.js').then(({ publishDashboardPushType }) => {
    publishDashboardPushType(tenantId, 'integrations.updated', [], { provider });
  });
}
