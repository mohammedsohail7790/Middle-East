"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { Phone, Users, TrendingUp, Clock, BarChart3, Filter, CalendarDays, Lock } from "lucide-react";
import { IconBox, outcomeIconVariant } from "@/components/ui-kit/IconBox";
import { StatusBadge } from "@/components/dashboard-shell/glass-card";
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart, Bar, CartesianGrid,
} from "recharts";
import { api, asArray, humanizeApiError } from "@/lib/api";
import { getTenantId, subscribePlanUpdates } from "@/lib/store";
import { canUseFeature } from "@/lib/plan-features";
import {
  readDashboardHomeCache,
  writeDashboardHomeCache,
  type CachedMetrics,
} from "@/lib/dashboard-cache";
import { fetchDashboardBootstrap, readBootstrapSnapshot } from "@/lib/dashboard-bootstrap";
import { funnelFromMetrics } from "@/lib/gateway-adapters";
import { useDashboardLive } from "@/components/dashboard/DashboardRealtimeProvider";
import { DASHBOARD_POLL_MS, useDashboardSync } from "@/lib/dashboard-sync";
import { timeAgo, formatDuration } from "@/lib/utils";
import { useTranslations, useLocale } from "next-intl";
import { StatCard } from "@/components/ui-kit/StatCard";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { VibePanel } from "@/components/magic-ui/vibe-panel";
import { SectionHeader } from "@/components/ui-kit/SectionHeader";

function greetingForHour(
  h: number,
  t: (key: "greetingMorning" | "greetingAfternoon" | "greetingEvening") => string
): string {
  if (h < 12) return t("greetingMorning");
  if (h < 17) return t("greetingAfternoon");
  return t("greetingEvening");
}

interface Metrics { totalCalls: number; leads: number; conversionRate: number; avgResponseLatency: number; avgCallDuration: number; }
interface VolumeDay { day: string; calls: number; leads: number; }
interface Call { id: string; call_sid: string; transcript: string; duration_ms: number; outcome: string | null; created_at: string; }

function normalizeMetrics(raw: CachedMetrics): Metrics {
  return {
    totalCalls: raw.totalCalls,
    leads: raw.leads,
    conversionRate:
      raw.conversionRate <= 1 && raw.conversionRate > 0
        ? Number((raw.conversionRate * 100).toFixed(1))
        : raw.conversionRate,
    avgResponseLatency: raw.avgResponseLatency ?? 0,
    avgCallDuration: raw.avgCallDuration ?? 0,
  };
}

function initialHomeState(tenantId: string | null) {
  const snapshot = readBootstrapSnapshot(tenantId);
  if (snapshot) {
    return {
      metrics: normalizeMetrics(snapshot.metrics),
      calls: snapshot.recentCalls as Call[],
      chartData: snapshot.callVolume,
      hasData: true,
    };
  }
  const cached = readDashboardHomeCache(tenantId, { allowStale: true });
  if (cached?.metrics) {
    return {
      metrics: normalizeMetrics(cached.metrics),
      calls: (cached.calls ?? []) as Call[],
      chartData: cached.chartData ?? [],
      hasData: true,
    };
  }
  const partial =
    (cached?.calls.length ?? 0) > 0 || (cached?.chartData.length ?? 0) > 0;
  return {
    metrics: null as Metrics | null,
    calls: (cached?.calls ?? []) as Call[],
    chartData: cached?.chartData ?? [],
    hasData: partial,
  };
}

export default function DashboardHome() {
  const t = useTranslations("pages.home");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const tenantId = getTenantId();
  const initial = initialHomeState(tenantId);
  const [metrics, setMetrics] = useState<Metrics | null>(() => initial.metrics);
  const { live } = useDashboardLive();
  const [calls, setCalls] = useState<Call[]>(() => initial.calls);
  const [chartData, setChartData] = useState<VolumeDay[]>(() => initial.chartData);
  const [loading, setLoading] = useState(() => !initial.hasData);
  const [error, setError] = useState("");
  const hadCacheRef = useRef(initial.hasData);
  const [, setPlanTick] = useState(0);
  const analyticsUnlocked = canUseFeature("analytics");

  useEffect(() => subscribePlanUpdates(() => setPlanTick((n) => n + 1)), []);

  const loadDashboardData = useCallback((showSpinner = false) => {
    if (showSpinner && !hadCacheRef.current) setLoading(true);
    const fresh = hadCacheRef.current ? undefined : { fresh: true as const };
    return Promise.allSettled([
      api.get<Metrics>("/dashboard/metrics", fresh),
      api.get<Call[]>("/calls", fresh),
      api.get<VolumeDay[]>("/dashboard/call-volume", fresh),
    ])
      .then(([m, c, v]) => {
        let nextMetrics: Metrics | null = null;
        let nextCalls: Call[] = [];
        let nextChart: VolumeDay[] = [];

        if (m.status === "fulfilled") {
          nextMetrics = normalizeMetrics(m.value);
          setMetrics(nextMetrics);
        }
        if (c.status === "fulfilled") {
          nextCalls = asArray<Call>(c.value).slice(0, 6);
          setCalls(nextCalls);
        }
        if (v.status === "fulfilled" && (v.value?.length ?? 0) > 0) {
          nextChart = v.value;
          setChartData(nextChart);
        }
        const tid = getTenantId();
        if (tid && nextMetrics) {
          writeDashboardHomeCache(tid, {
            metrics: nextMetrics,
            calls: nextCalls,
            chartData: nextChart,
          });
        }
        const rejected = [m, c, v].filter((r) => r.status === "rejected");
        if (rejected.length > 0 && !nextMetrics && !hadCacheRef.current) {
          const messages = [
            ...new Set(
              rejected.map((r) => humanizeApiError((r as PromiseRejectedResult).reason))
            ),
          ];
          setError(messages.join(" · "));
        } else if (rejected.length === 0) {
          setError("");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const tid = getTenantId();
    if (!tid) {
      void loadDashboardData(true);
      return;
    }

    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
    let bootstrapDone = false;

    void fetchDashboardBootstrap(tid).then((boot) => {
      bootstrapDone = true;
      if (boot) {
        setMetrics(normalizeMetrics(boot.metrics));
        setCalls(boot.recentCalls as Call[]);
        if (boot.callVolume.length > 0) setChartData(boot.callVolume);
        hadCacheRef.current = true;
        setLoading(false);
        setError("");
        return;
      }
      if (!hadCacheRef.current) {
        void loadDashboardData(true);
      }
    });

    if (!hadCacheRef.current) {
      fallbackTimer = setTimeout(() => {
        if (!bootstrapDone && !hadCacheRef.current) {
          void loadDashboardData(false);
        }
      }, 600);
    }

    return () => {
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [loadDashboardData]);

  useDashboardSync(["calls", "metrics", "analytics"], () => {
    void loadDashboardData(false);
  }, { debounceMs: 2500, pollMs: DASHBOARD_POLL_MS, pollOnlyWhenDisconnected: true });

  useEffect(() => {
    if (!live) return;
    setMetrics((prev) => ({
      totalCalls: live.totalCalls ?? prev?.totalCalls ?? 0,
      leads: live.totalLeads ?? prev?.leads ?? 0,
      conversionRate:
        live.totalCalls > 0 && live.totalLeads != null
          ? Number(((live.totalLeads / live.totalCalls) * 100).toFixed(1))
          : prev?.conversionRate ?? 0,
      avgResponseLatency: prev?.avgResponseLatency ?? 0,
      avgCallDuration: prev?.avgCallDuration ?? 0,
    }));
    const changed = (live as { changed?: string[] }).changed;
    if (!Array.isArray(changed) || changed.length === 0) return;
    if (changed.some((c) => c === "calls" || c === "metrics")) {
      void api.get<Call[]>("/calls").then((data) => setCalls(asArray<Call>(data).slice(0, 6)));
    }
    if (changed.some((c) => c === "calls" || c === "analytics" || c === "metrics")) {
      void api
        .get<VolumeDay[]>("/dashboard/call-volume")
        .then((v) => {
          if ((v?.length ?? 0) > 0) setChartData(v);
        })
        .catch(() => {});
    }
  }, [live]);

  // Derive week-over-half trend + sparkline from the 7-day chartData we already fetch.
  // Compares mean of the last 3 days to the first 4 days — cheap, no extra request.
  const trendFrom = (series: number[]) => {
    if (series.length < 4) return undefined;
    const half = Math.floor(series.length / 2);
    const first = series.slice(0, half);
    const last = series.slice(half);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    const before = mean(first);
    const after = mean(last);
    if (before <= 0) return after > 0 ? { value: 100, label: "vs earlier this week" } : undefined;
    const pct = ((after - before) / before) * 100;
    return { value: Number(pct.toFixed(1)), label: "vs earlier this week" };
  };
  const callsSpark = chartData.map((d) => d.calls);
  const leadsSpark = chartData.map((d) => d.leads);
  const callsTrend = trendFrom(callsSpark);
  const leadsTrend = trendFrom(leadsSpark);

  const volumeChart =
    chartData.length > 0
      ? chartData
      : [
          { day: t("days.mon"), calls: 0, leads: 0 },
          { day: t("days.tue"), calls: 0, leads: 0 },
          { day: t("days.wed"), calls: 0, leads: 0 },
          { day: t("days.thu"), calls: 0, leads: 0 },
          { day: t("days.fri"), calls: 0, leads: 0 },
          { day: t("days.sat"), calls: 0, leads: 0 },
          { day: t("days.sun"), calls: 0, leads: 0 },
        ];

  const funnelData = funnelFromMetrics({
    totalCalls: metrics?.totalCalls,
    totalLeads: metrics?.leads,
    conversionRate: metrics?.conversionRate,
  });

  const greeting = greetingForHour(new Date().getHours(), t);
  const todayLabel = new Date().toLocaleDateString(locale === "ar" ? "ar-AE" : "en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <DashboardPage
      title={greeting}
      description={
        live && live.activeCalls > 0
          ? live.activeCalls === 1
            ? t("descriptionLive", { count: live.activeCalls })
            : t("descriptionLivePlural", { count: live.activeCalls })
          : t("descriptionDefault")
      }
      actions={
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground border border-border bg-card/60">
            <CalendarDays className="size-3.5 opacity-60" />
            {todayLabel}
          </span>
          {live && live.activeCalls > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/60">
              <span className="relative flex size-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full size-2 bg-green-500" />
              </span>
              {t("liveBadge", { count: live.activeCalls })}
            </span>
          )}
        </div>
      }
      loading={false}
      error={error || undefined}
      onRetry={error ? () => void loadDashboardData(true) : undefined}
      maxWidth="xl"
    >
      <div className="dashboard-stat-grid">
        <Link href="/dashboard/calls" className="block min-w-0">
          <StatCard
            label={t("totalCalls")}
            value={metrics ? String(metrics.totalCalls) : loading ? "—" : "0"}
            hint={live?.callsToday ? t("hintToday", { count: live.callsToday }) : t("hintAllTime")}
            trend={callsTrend}
            sparkline={callsSpark}
            icon={Phone}
            iconVariant="accent"
            index={0}
            className="h-full card-hover cursor-pointer"
          />
        </Link>
        <Link href="/dashboard/leads" className="block min-w-0">
          <StatCard
            label={t("leadsCaptured")}
            value={metrics ? String(metrics.leads) : loading ? "—" : "0"}
            hint={t("hintFromCalls")}
            trend={leadsTrend}
            sparkline={leadsSpark}
            icon={Users}
            iconVariant="violet"
            index={1}
            className="h-full card-hover cursor-pointer"
          />
        </Link>
        <Link href={analyticsUnlocked ? "/dashboard/analytics" : "/dashboard/billing"} className="block min-w-0">
          <StatCard
            label={t("conversionRate")}
            value={analyticsUnlocked ? (metrics ? `${metrics.conversionRate}%` : loading ? "—" : "0%") : t("proBadge")}
            hint={analyticsUnlocked ? t("hintConversion") : t("hintUpgradeAnalytics")}
            icon={analyticsUnlocked ? TrendingUp : Lock}
            iconVariant={analyticsUnlocked ? "success" : "muted"}
            index={2}
            className="h-full card-hover cursor-pointer"
          />
        </Link>
        <Link href={analyticsUnlocked ? "/dashboard/analytics" : "/dashboard/billing"} className="block min-w-0">
          <StatCard
            label={t("avgResponse")}
            value={analyticsUnlocked ? (metrics ? `${metrics.avgResponseLatency}ms` : loading ? "—" : "0ms") : t("proBadge")}
            hint={analyticsUnlocked ? t("hintResponse") : t("hintUpgradeAnalytics")}
            icon={analyticsUnlocked ? Clock : Lock}
            iconVariant={analyticsUnlocked ? "neutral" : "muted"}
            index={3}
            className="h-full card-hover cursor-pointer"
          />
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-w-0">
        <VibePanel beam className="lg:col-span-2 min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
        <div className="wb-panel-padded min-w-0 !border-0 !shadow-none !rounded-none">
          <div className="flex items-start justify-between gap-4 mb-4">
            <SectionHeader
              icon={BarChart3}
              title={t("callVolume")}
              description={t("last7Days")}
              size="sm"
            />
            <div className="flex items-center gap-3 shrink-0 pt-0.5">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <span className="inline-block w-3 h-0.5 rounded-full bg-accent" />
                {t("calls")}
              </span>
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <span className="inline-block w-3 h-0.5 rounded-full bg-accent-mid" />
                {t("leads")}
              </span>
            </div>
          </div>
          <div className="h-52 sm:h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={volumeChart}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-mid)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--accent-mid)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.6} />
                <XAxis dataKey="day" stroke="currentColor" opacity={0.4} fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="currentColor" opacity={0.4} fontSize={12} width={32} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12, boxShadow: "var(--shadow-md)" }}
                  cursor={{ stroke: "var(--accent)", strokeWidth: 1, strokeDasharray: "4 2" }}
                />
                <Area type="monotone" dataKey="calls" stroke="var(--accent)" fill="url(#g1)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                <Area type="monotone" dataKey="leads" stroke="var(--accent-mid)" fill="url(#g2)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        </VibePanel>

        <VibePanel className="min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
        <div className="wb-panel-padded min-w-0 !border-0 !shadow-none !rounded-none">
          <SectionHeader icon={Filter} title={t("conversionFunnel")} size="sm" className="mb-4" />
          {!analyticsUnlocked ? (
            <div className="flex flex-col items-center justify-center text-center gap-3 py-10 px-4 rounded-xl border border-dashed border-border bg-muted/30">
              <Lock className="size-5 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground max-w-xs">
                {t("funnelLocked")}
              </p>
              <Link href="/dashboard/billing" className="text-xs font-semibold text-primary hover:underline">
                {tCommon("viewPlans")}
              </Link>
            </div>
          ) : (
          <div className="h-52 sm:h-64 w-full min-w-0">
            {funnelData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">{tCommon("noData")}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={funnelData} layout="vertical" margin={{ left: 8, right: 8 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" stroke="currentColor" opacity={0.5} fontSize={11} width={72} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} />
                  <Bar dataKey="value" fill="var(--accent)" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          )}
        </div>
        </VibePanel>
      </div>

      <VibePanel className="min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
      <div className="wb-panel-padded min-w-0 !border-0 !shadow-none !rounded-none">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <SectionHeader title={t("recentActivity")} size="sm" />
          <Link href="/dashboard/calls" className="text-xs font-semibold text-primary hover:underline min-h-[44px] sm:min-h-0 flex items-center shrink-0">
            {t("viewAll")}
          </Link>
        </div>
        {calls.length > 0 && (
          <div className="enterprise-table-header">
            <div className="flex-1 min-w-0 enterprise-table-col">{t("colActivity")}</div>
            <div className="hidden sm:block w-28 text-right enterprise-table-col">{t("colTimeDuration")}</div>
            <div className="w-20 text-right enterprise-table-col">{t("colStatus")}</div>
          </div>
        )}
        <div className="divide-y divide-border" style={{ borderColor: "color-mix(in srgb, var(--border) 60%, transparent)" }}>
          {loading && calls.length === 0 ? (
            <div className="space-y-1 py-1" aria-hidden>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-3 px-3 -mx-1">
                  <div className="dashboard-skeleton size-10 rounded-xl shrink-0" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="dashboard-skeleton h-3.5 w-3/5 rounded" />
                    <div className="dashboard-skeleton h-3 w-2/5 rounded" />
                  </div>
                  <div className="dashboard-skeleton h-5 w-16 rounded-full shrink-0" />
                </div>
              ))}
            </div>
          ) : calls.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("noCallsYet")}</p>
          ) : (
            calls.map((call) => (
              <Link
                key={call.id}
                href={`/dashboard/calls/${call.id}`}
                className="wb-activity-row vibe-call-row cursor-pointer"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <IconBox icon={Phone} variant={outcomeIconVariant(call.outcome)} size="md" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {call.transcript?.substring(0, 70) || call.call_sid}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {timeAgo(call.created_at)} · {formatDuration(call.duration_ms)}
                    </div>
                  </div>
                </div>
                <StatusBadge
                  status={
                    call.outcome === "failed" ? "error" : call.outcome === "completed" ? "success" : "info"
                  }
                >
                  {call.outcome || "unknown"}
                </StatusBadge>
              </Link>
            ))
          )}
        </div>
      </div>
      </VibePanel>
    </DashboardPage>
  );
}
