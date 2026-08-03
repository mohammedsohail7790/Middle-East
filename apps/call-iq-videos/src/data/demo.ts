import demoIndex from "../../demo-data.json";
import businesses from "../../demo-assets/sample-businesses.json";
import leads from "../../demo-assets/sample-leads.json";
import calls from "../../demo-assets/sample-calls.json";
import transcripts from "../../demo-assets/sample-transcripts.json";
import appointments from "../../demo-assets/sample-appointments.json";
import analytics from "../../demo-assets/sample-analytics.json";
import crmRecords from "../../demo-assets/sample-crm-records.json";

export const demo = {
  index: demoIndex,
  businesses,
  leads,
  calls,
  transcripts,
  appointments,
  analytics,
  crm: crmRecords,
} as const;

export const northline = businesses.northlineHomeServices;
export const summit = businesses.summitComfortHvac;

export const agents = demoIndex.agents;
export const phoneNumbers = demoIndex.phoneNumbers;
export const routingRules = demoIndex.routingRules;
export const multiTenantExamples = demoIndex.multiTenantExamples;

export const dashboardStats = appointments.todayStats;
export const recentCalls = calls.recentCallsDashboard;
export const reportingPeriod = analytics.reportingPeriod;

export type DemoMetric = {
  label: string;
  value: string;
  change?: string;
};

export const analyticsChapters = analytics.chapterMetrics;
export { analytics };
