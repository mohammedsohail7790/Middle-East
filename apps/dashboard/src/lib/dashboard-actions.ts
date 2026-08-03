import type { DashboardSyncScope } from "./dashboard-sync";
import { syncAfterMutation } from "@/components/dashboard/DashboardRealtimeProvider";

/** Standard scope bundles for dashboard mutations — use after any API write */
export const dashboardActionScopes = {
  calls: ["calls", "metrics", "analytics"] as DashboardSyncScope[],
  callDetail: ["calls", "calendar", "leads", "metrics", "analytics"] as DashboardSyncScope[],
  leads: ["leads", "metrics", "analytics"] as DashboardSyncScope[],
  calendar: ["calendar", "calls", "leads", "metrics", "analytics"] as DashboardSyncScope[],
  sms: ["sms", "calls", "metrics"] as DashboardSyncScope[],
  phone: ["phone", "config", "calls", "sms"] as DashboardSyncScope[],
  config: ["config", "calls", "knowledge", "settings"] as DashboardSyncScope[],
  knowledge: ["knowledge", "config"] as DashboardSyncScope[],
  integrations: ["integrations", "calendar", "leads"] as DashboardSyncScope[],
  settings: ["settings", "team"] as DashboardSyncScope[],
  team: ["team", "settings"] as DashboardSyncScope[],
  billing: ["billing", "metrics", "phone", "integrations"] as DashboardSyncScope[],
} as const;

export type DashboardActionKey = keyof typeof dashboardActionScopes;

export function syncDashboardAction(action: DashboardActionKey | DashboardSyncScope[]) {
  const scopes = Array.isArray(action) ? action : dashboardActionScopes[action];
  syncAfterMutation(scopes);
}
