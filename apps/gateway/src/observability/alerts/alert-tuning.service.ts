import type { PlatformAnomaly } from '../anomaly-detection/anomaly-detector.js';

export interface TunedAlert extends PlatformAnomaly {
  confidence: number;
  dedupeKey: string;
  escalated: boolean;
  suppressed: boolean;
}

const recentFingerprints = new Map<string, number>();
const DEDUPE_WINDOW_MS = Number(process.env.CALLIQ_ALERT_DEDUPE_MS || 300_000);
const MIN_CONFIDENCE = Number(process.env.CALLIQ_ALERT_MIN_CONFIDENCE || 0.55);

function fingerprint(a: PlatformAnomaly, tenantId?: string): string {
  return `${tenantId || 'global'}:${a.id}:${a.category}`;
}

function scoreConfidence(a: PlatformAnomaly): number {
  if (!a.value || !a.threshold) return 0.7;
  const ratio = a.value / Math.max(a.threshold, 0.001);
  if (a.id === 'governance_denial_rate') return Math.min(0.95, 0.5 + ratio);
  if (a.id === 'dlq_growth') return Math.min(0.99, 0.4 + ratio * 0.15);
  if (a.id === 'reconnect_spike') return Math.min(0.9, 0.45 + ratio * 0.12);
  if (a.id === 'reconnect_storm') return Math.min(0.95, 0.55 + ratio * 0.1);
  return Math.min(0.85, 0.5 + ratio * 0.1);
}

function tenantWeight(tenantId?: string): number {
  if (!tenantId) return 1;
  return 1;
}

/** Dedupe, score confidence, suppress noise — preserves alert lineage via dedupeKey. */
export function tuneAlerts(anomalies: PlatformAnomaly[], tenantId?: string): TunedAlert[] {
  const now = Date.now();
  const tuned: TunedAlert[] = [];

  for (const a of anomalies) {
    const confidence = Math.round(scoreConfidence(a) * tenantWeight(tenantId) * 100) / 100;
    const dedupeKey = fingerprint(a, tenantId);
    const last = recentFingerprints.get(dedupeKey) || 0;
    const duplicate = now - last < DEDUPE_WINDOW_MS;
    const suppressed = duplicate && a.severity !== 'critical' && confidence < 0.85;

    if (!suppressed) recentFingerprints.set(dedupeKey, now);

    if (confidence < MIN_CONFIDENCE && a.severity !== 'critical') continue;

    tuned.push({
      ...a,
      confidence,
      dedupeKey,
      escalated: a.severity === 'critical' || confidence > 0.85,
      suppressed,
    });
  }

  for (const [k, t] of recentFingerprints) {
    if (now - t > DEDUPE_WINDOW_MS * 4) recentFingerprints.delete(k);
  }

  return tuned.filter((a) => !a.suppressed);
}

export function correlateAlerts(alerts: TunedAlert[]): { group: string; alerts: TunedAlert[] }[] {
  const groups = new Map<string, TunedAlert[]>();
  for (const a of alerts) {
    const g = groups.get(a.category) || [];
    g.push(a);
    groups.set(a.category, g);
  }
  return [...groups.entries()].map(([group, items]) => ({ group, alerts: items }));
}
