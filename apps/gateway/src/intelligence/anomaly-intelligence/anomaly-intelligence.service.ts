import { evaluateAnomalies, type PlatformAnomaly } from '../../observability/anomaly-detection/anomaly-detector.js';
import { anomaliesToAlerts } from '../../observability/alerts/alert-engine.js';

export interface AnomalyIntelligenceReport {
  tenantId: string | null;
  anomalies: PlatformAnomaly[];
  alerts: PlatformAnomaly[];
  correlatedGroups: { category: string; count: number; maxSeverity: string }[];
  riskScore: number;
}

export async function buildAnomalyIntelligence(tenantId?: string): Promise<AnomalyIntelligenceReport> {
  const anomalies = await evaluateAnomalies(tenantId);
  const alerts = anomaliesToAlerts(anomalies);
  const byCat = new Map<string, PlatformAnomaly[]>();
  for (const a of anomalies) {
    const list = byCat.get(a.category) || [];
    list.push(a);
    byCat.set(a.category, list);
  }
  const correlatedGroups = [...byCat.entries()].map(([category, items]) => ({
    category,
    count: items.length,
    maxSeverity: items.some((i) => i.severity === 'critical') ? 'critical' : 'warning',
  }));
  const riskScore = Math.min(
    100,
    anomalies.filter((a) => a.severity === 'critical').length * 25 +
      anomalies.filter((a) => a.severity === 'warning').length * 10
  );
  return { tenantId: tenantId || null, anomalies, alerts, correlatedGroups, riskScore };
}
