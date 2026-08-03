/**
 * DashboardMetricsStreamer
 *
 * @deprecated This class is no longer used. Real-time dashboard metrics are
 * delivered via the SSE endpoint in dashboard.controller.ts which uses
 * Redis pub/sub push events and a shared subscriber connection.
 *
 * This file is retained only to avoid breaking any external imports that may
 * reference it. Do not add new functionality here.
 */

import { logger } from '../logger.js';

interface StreamingMetrics {
  totalCalls: number;
  leads: number;
  conversionRate: number;
  avgResponseLatency: number;
  avgCallDuration: number;
  lastUpdated: string;
}

/** @deprecated Use the SSE stream endpoint at GET /api/v1/dashboard/stream instead. */
export class DashboardMetricsStreamer {
  private activeStreams = new Map<string, { intervalId: NodeJS.Timeout }>();

  /** @deprecated */
  setupStreamForTenant(_tenantId: string, _onMetrics: (metrics: StreamingMetrics) => void): () => void {
    logger.warn('DashboardMetricsStreamer.setupStreamForTenant is deprecated and does nothing. Use the SSE dashboard/stream endpoint.');
    return () => {};
  }

  cancelAllStreams(): void {
    this.activeStreams.forEach(({ intervalId }) => clearInterval(intervalId));
    this.activeStreams.clear();
  }
}

export const dashboardMetricsStreamer = new DashboardMetricsStreamer();
