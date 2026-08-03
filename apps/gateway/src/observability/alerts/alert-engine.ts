import type { PlatformAnomaly } from '../anomaly-detection/anomaly-detector.js';
import { logger } from '../../services/logger.js';

export interface AlertRule {
  id: string;
  name: string;
  severity: 'warning' | 'critical';
  enabled: boolean;
}

const DEFAULT_RULES: AlertRule[] = [
  { id: 'dlq_growth', name: 'DLQ growth', severity: 'critical', enabled: true },
  { id: 'reconnect_spike', name: 'Reconnect spike', severity: 'warning', enabled: true },
  { id: 'reconnect_storm', name: 'Reconnect storm', severity: 'critical', enabled: true },
  { id: 'governance_denial_rate', name: 'Governance denial rate', severity: 'warning', enabled: true },
  { id: 'memory_pressure', name: 'Memory pressure', severity: 'warning', enabled: true },
];

export function getAlertRules(): AlertRule[] {
  return DEFAULT_RULES;
}

export function anomaliesToAlerts(anomalies: PlatformAnomaly[]): PlatformAnomaly[] {
  const enabled = new Set(DEFAULT_RULES.filter((r) => r.enabled).map((r) => r.id));
  enabled.add('reconnect_storm');
  const fired = anomalies.filter((a) => enabled.has(a.id));
  for (const a of fired) {
    if (a.severity === 'critical') {
      logger.warn('PLATFORM_ALERT_CRITICAL', { id: a.id, message: a.message, confidence: a.confidence });
    }
  }
  return fired;
}

export { tuneAlerts, correlateAlerts, type TunedAlert } from './alert-tuning.service.js';
