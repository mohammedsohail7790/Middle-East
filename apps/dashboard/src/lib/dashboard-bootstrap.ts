"use client";

import { api } from "./api";
import { writeApiGetCache } from "./api-get-cache";
import {
  writeDashboardHomeCache,
  readDashboardHomeCache,
  type CachedCall,
  type CachedMetrics,
  type CachedVolumeDay,
} from "./dashboard-cache";

export type DashboardBootstrapPayload = {
  metrics: CachedMetrics & {
    successfulCalls?: number;
    failedCalls?: number;
  };
  callVolume: CachedVolumeDay[];
  recentCalls: CachedCall[];
  leadsPreview: unknown[];
  tenant: {
    id: string;
    company_name?: string;
    companyName?: string;
    phone_number?: string;
  };
};

let bootstrapInflight: Promise<DashboardBootstrapPayload | null> | null = null;
let lastBootstrap: DashboardBootstrapPayload | null = null;
let lastBootstrapAt = 0;
const BOOTSTRAP_TTL_MS = 30_000;

export function getLastBootstrap(): DashboardBootstrapPayload | null {
  if (!lastBootstrap || Date.now() - lastBootstrapAt > BOOTSTRAP_TTL_MS) return null;
  return lastBootstrap;
}

function seedCaches(tenantId: string, data: DashboardBootstrapPayload): void {
  const metrics: CachedMetrics = {
    totalCalls: data.metrics.totalCalls,
    leads: data.metrics.leads,
    conversionRate: data.metrics.conversionRate,
    avgResponseLatency: (data.metrics as any).avgResponseLatency ?? (data.metrics as any).avgLatency ?? 0,
    avgCallDuration: (data.metrics as any).avgCallDuration ?? 0,
  };

  writeApiGetCache("/dashboard/metrics", metrics);
  writeApiGetCache("/dashboard/call-volume", data.callVolume);
  writeApiGetCache("/calls", data.recentCalls);
  const callsList = {
    items: data.recentCalls,
    total: metrics.totalCalls,
    limit: 50,
    offset: 0,
    hasMore: metrics.totalCalls > 50,
  };
  writeApiGetCache("/calls?limit=50&offset=0", callsList);
  writeApiGetCache("/tenants/me", data.tenant);
  writeApiGetCache("/leads?limit=500&offset=0", data.leadsPreview);
  writeApiGetCache("/leads?limit=50&offset=0", data.leadsPreview);

  writeDashboardHomeCache(tenantId, {
    metrics,
    calls: data.recentCalls,
    chartData: data.callVolume,
  });
}

/** One HTTP request to warm all dashboard caches after login. */
export async function fetchDashboardBootstrap(
  tenantId: string,
  options?: { fresh?: boolean }
): Promise<DashboardBootstrapPayload | null> {
  if (!options?.fresh) {
    const cached = getLastBootstrap();
    if (cached) {
      seedCaches(tenantId, cached);
      return cached;
    }
  }

  if (bootstrapInflight) return bootstrapInflight;

  bootstrapInflight = api
    .get<DashboardBootstrapPayload>(
      "/dashboard/bootstrap",
      options?.fresh ? { fresh: true } : undefined
    )
    .then((data) => {
      lastBootstrap = data;
      lastBootstrapAt = Date.now();
      seedCaches(tenantId, data);
      return data;
    })
    .catch(() => null)
    .finally(() => {
      bootstrapInflight = null;
    });

  return bootstrapInflight;
}

export function clearDashboardBootstrap(): void {
  lastBootstrap = null;
  lastBootstrapAt = 0;
  bootstrapInflight = null;
}

export { warmGateway, warmGatewayWhenReady } from "./gateway-warm";

/** Synchronous first paint from in-memory bootstrap or session cache. */
export function readBootstrapSnapshot(
  tenantId: string | null
): DashboardBootstrapPayload | null {
  if (!tenantId) return null;

  const mem = getLastBootstrap();
  if (mem) return mem;

  const home = readDashboardHomeCache(tenantId, { allowStale: true });
  if (!home?.metrics) return null;

  return {
    metrics: home.metrics,
    callVolume: home.chartData,
    recentCalls: home.calls,
    leadsPreview: [],
    tenant: { id: tenantId },
  };
}
