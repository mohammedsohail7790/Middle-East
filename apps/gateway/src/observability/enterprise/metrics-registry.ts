/**
 * In-process metrics registry (Prometheus-compatible export).
 * OpenTelemetry SDK can wrap these counters later without changing call sites.
 */

type Labels = Record<string, string>;

const counters = new Map<string, number>();
const gauges = new Map<string, number>();

function key(name: string, labels?: Labels): string {
  if (!labels || !Object.keys(labels).length) return name;
  const parts = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`);
  return `${name}{${parts.join(',')}}`;
}

export function incCounter(name: string, labels?: Labels, delta = 1): void {
  const k = key(name, labels);
  counters.set(k, (counters.get(k) || 0) + delta);
}

export function setGauge(name: string, value: number, labels?: Labels): void {
  gauges.set(key(name, labels), value);
}

export function getRegistrySnapshot(): { counters: Record<string, number>; gauges: Record<string, number> } {
  return {
    counters: Object.fromEntries(counters),
    gauges: Object.fromEntries(gauges),
  };
}

export function toPrometheusText(): string {
  const lines: string[] = [];
  for (const [k, v] of counters) {
    lines.push(`# TYPE ${k.split('{')[0]} counter`);
    lines.push(`${k} ${v}`);
  }
  for (const [k, v] of gauges) {
    lines.push(`# TYPE ${k.split('{')[0]} gauge`);
    lines.push(`${k} ${v}`);
  }
  return lines.join('\n') + '\n';
}
