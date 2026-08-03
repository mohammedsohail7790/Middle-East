import { evaluateAnomalies } from '../../observability/anomaly-detection/anomaly-detector.js';
import { getAlertRules } from '../../observability/alerts/alert-engine.js';
import { tuneAlerts } from '../../observability/alerts/alert-tuning.service.js';
import { logger } from '../../services/logger.js';

export interface RoutedAlert {
  ruleId: string;
  severity: string;
  channel: 'log' | 'webhook' | 'email';
  message: string;
  tenantId?: string;
}

export async function routeOperationalAlerts(tenantId?: string): Promise<RoutedAlert[]> {
  const raw = await evaluateAnomalies(tenantId);
  const anomalies = tuneAlerts(raw, tenantId);
  const rules = getAlertRules();
  const routed: RoutedAlert[] = [];

  for (const a of anomalies) {
    const rule = rules.find((r) => r.id === a.id);
    if (!rule?.enabled) continue;
    const channel =
      a.severity === 'critical' && process.env.CALLIQ_ALERT_WEBHOOK_URL ? 'webhook' : 'log';
    routed.push({
      ruleId: a.id,
      severity: a.severity,
      channel,
      message: a.message,
      tenantId,
    });
    logger.warn('OPS_ALERT_ROUTED', { ruleId: a.id, severity: a.severity, tenantId });
  }
  return routed;
}
