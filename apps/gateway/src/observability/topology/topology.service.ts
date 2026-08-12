import { sessionRegistry } from '../../services/realtime/session-registry.js';
import { getPlatformEventBus, isP2EventBusEnabled } from '../../events/platform-event-bus.js';
import { collectStreamDiagnostics } from '../../events/event-metrics.js';
import { aiGovernanceService } from '../../services/ai-governance/ai-governance.service.js';
import { listRecentSpans } from '../enterprise/tracing.js';
import { evaluateAnomalies } from '../anomaly-detection/anomaly-detector.js';

export interface TopologyNode {
  id: string;
  type: 'gateway' | 'runtime' | 'transport' | 'ai' | 'events' | 'consumer' | 'datastore';
  label: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  metrics?: Record<string, number>;
}

export interface TopologyEdge {
  from: string;
  to: string;
  label: string;
  throughput?: number;
}

export interface RuntimeTopology {
  timestamp: string;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  lineage: { requestId?: string; spans: ReturnType<typeof listRecentSpans> };
  anomalies: Awaited<ReturnType<typeof evaluateAnomalies>>;
}

export async function buildRuntimeTopology(tenantId?: string): Promise<RuntimeTopology> {
  const sessions = sessionRegistry
    .listActive()
    .filter((s) => !tenantId || s.tenantId === tenantId);
  const ai = aiGovernanceService.getMetricsSnapshot();
  let dlqDepth = 0;
  let streamsEnabled = false;
  const bus = getPlatformEventBus();
  if (bus && isP2EventBusEnabled()) {
    streamsEnabled = true;
    const diag = await collectStreamDiagnostics(bus.getRedis());
    dlqDepth = (diag as { dlqDepth?: number }).dlqDepth || 0;
  }

  const nodes: TopologyNode[] = [
    { id: 'gateway', type: 'gateway', label: 'Halla AI Gateway', status: 'healthy' },
    {
      id: 'runtime',
      type: 'runtime',
      label: 'CallRuntimeSession',
      status: sessions.some((s) => s.state === 'reconnecting') ? 'degraded' : 'healthy',
      metrics: { active: sessions.length, reconnecting: sessions.filter((s) => s.state === 'reconnecting').length },
    },
    { id: 'transport_ws', type: 'transport', label: 'WebSocket Transport', status: 'healthy' },
    { id: 'transport_twilio', type: 'transport', label: 'Twilio Transport', status: 'healthy' },
    {
      id: 'ai_governance',
      type: 'ai',
      label: 'AI Governance',
      status: ai.denials > ai.executions * 0.3 ? 'degraded' : 'healthy',
      metrics: { executions: ai.executions, denials: ai.denials },
    },
    {
      id: 'event_bus',
      type: 'events',
      label: 'Redis Streams',
      status: !streamsEnabled ? 'degraded' : dlqDepth > 50 ? 'degraded' : 'healthy',
      metrics: { dlqDepth },
    },
    { id: 'postgres', type: 'datastore', label: 'Postgres', status: 'healthy' },
    { id: 'redis', type: 'datastore', label: 'Redis', status: 'healthy' },
  ];

  const consumers = ['audit', 'analytics', 'automation', 'crm', 'notifications'];
  for (const c of consumers) {
    nodes.push({
      id: `consumer_${c}`,
      type: 'consumer',
      label: `${c} consumer`,
      status: dlqDepth > 100 ? 'degraded' : 'healthy',
    });
  }

  const edges: TopologyEdge[] = [
    { from: 'transport_ws', to: 'runtime', label: 'inbound audio' },
    { from: 'transport_twilio', to: 'runtime', label: 'inbound call' },
    { from: 'runtime', to: 'ai_governance', label: 'tool execution' },
    { from: 'runtime', to: 'event_bus', label: 'platform events' },
    { from: 'event_bus', to: 'consumer_audit', label: 'consume' },
    { from: 'event_bus', to: 'consumer_analytics', label: 'consume' },
    { from: 'runtime', to: 'postgres', label: 'persistence' },
    { from: 'event_bus', to: 'redis', label: 'streams' },
  ];

  const anomalies = await evaluateAnomalies(tenantId);

  return {
    timestamp: new Date().toISOString(),
    nodes,
    edges,
    lineage: { spans: listRecentSpans(40) },
    anomalies,
  };
}
