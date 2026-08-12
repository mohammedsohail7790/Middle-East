/**
 * OAuth redirect helper — skeleton stub kept only for its dashboard-URL helper.
 * Third-party OAuth connect flows were removed; this just resolves the dashboard origin.
 */

export function getDashboardBaseUrl(): string {
  return process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3000';
}
