import { sessionRegistry } from '../../services/realtime/session-registry.js';
import { getPlatformEventBus, isP2EventBusEnabled } from '../../events/platform-event-bus.js';
import { collectStreamDiagnostics } from '../../events/event-metrics.js';

export interface ScalingAdvice {
  gatewayReplicas: { min: number; max: number; reason: string };
  consumerReplicas: { min: number; max: number; reason: string };
  scaleDownSafe: boolean;
  memoryPressure: boolean;
  queuePressure: number;
  recommendations: string[];
}

export async function adviseScaling(): Promise<ScalingAdvice> {
  const sessions = sessionRegistry.listActive().length;
  const mem = process.memoryUsage();
  const heapMb = mem.heapUsed / 1024 / 1024;
  const memoryPressure = heapMb > Number(process.env.CALLIQ_HEAP_WARN_MB || 512);

  let queuePressure = 0;
  if (getPlatformEventBus() && isP2EventBusEnabled()) {
    const bus = getPlatformEventBus()!;
    const diag = await collectStreamDiagnostics(bus.getRedis());
    const streams = (diag as { streams?: Record<string, number> }).streams || {};
    queuePressure = Object.values(streams).reduce((s, v) => s + v, 0);
  }

  const gatewayMax = Math.min(20, Math.max(2, Math.ceil(sessions / 25) + 2));
  const consumerMax = Math.min(8, Math.max(2, Math.ceil(queuePressure / 500) + 1));

  const recommendations: string[] = [];
  if (memoryPressure) recommendations.push('Defer scale-down until heap stabilizes');
  if (sessions > 100) recommendations.push('Consider raising gateway minReplicas to 3');
  if (queuePressure > 2000) recommendations.push('Increase consumer concurrency before gateway replicas');

  return {
    gatewayReplicas: {
      min: sessions > 50 ? 3 : 2,
      max: gatewayMax,
      reason: `active_sessions=${sessions}`,
    },
    consumerReplicas: {
      min: 2,
      max: consumerMax,
      reason: `queue_depth=${queuePressure}`,
    },
    scaleDownSafe: !memoryPressure && sessions < 20 && queuePressure < 200,
    memoryPressure,
    queuePressure,
    recommendations,
  };
}
