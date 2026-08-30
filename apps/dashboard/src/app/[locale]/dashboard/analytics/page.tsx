"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import {
  TrendingUp, Phone, Users, Clock, Download, Calendar, Filter
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid
} from "recharts";
import { Link } from "@/i18n/navigation";
import { api, asArray } from "@/lib/api";
import { normalizeAnalyticsMetrics, funnelFromApi } from "@/lib/gateway-adapters";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { SectionHeader } from "@/components/ui-kit/SectionHeader";
import { StatCard } from "@/components/ui-kit/StatCard";
import { EmptyState } from "@/components/ui-kit/EmptyState";
import { cn } from "@/lib/utils";
import { DASHBOARD_POLL_MS } from "@/lib/dashboard-sync";
import { useRealtimeQuery } from "@/lib/use-realtime-query";
import { PlanFeatureGate } from "@/components/billing/PlanFeatureGate";
import { VibePanel } from "@/components/magic-ui/vibe-panel";
import { useDashboardPageLabels } from "@/lib/use-dashboard-page-labels";

interface Metrics {
  totalCalls: number;
  totalLeads: number;
  conversionRate: number;
  avgDuration: number;
  callsChange: number;
  leadsChange: number;
}

interface CallVolume {
  date: string;
  calls: number;
  leads: number;
  conversions: number;
}

interface FunnelStep {
  name: string;
  value: number;
  percentage: number;
}

export default function AnalyticsPage() {
  return (
    <PlanFeatureGate feature="analytics">
      <AnalyticsPageContent />
    </PlanFeatureGate>
  );
}

function AnalyticsPageContent() {
  const t = useTranslations("pages.analytics");
  const { title, description } = useDashboardPageLabels("/dashboard/analytics");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [callVolume, setCallVolume] = useState<CallVolume[]>([]);
  const [funnel, setFunnel] = useState<FunnelStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [exportingPdf, setExportingPdf] = useState(false);

  const fetchData = useCallback((opts?: { withSpinner?: boolean }) => {
    if (opts?.withSpinner !== false) setLoading(true);
    setError("");
    const params = `?startDate=${startDate}&endDate=${endDate}`;
    return Promise.allSettled([
      api.get<Metrics>(`/analytics/metrics${params}`).catch((e) => {
        if (e?.message?.includes("403") || e?.status === 403) throw e;
        return api.get<Record<string, unknown>>("/dashboard/metrics").then((d) => ({
          totalCalls: Number(d.totalCalls ?? 0),
          totalLeads: Number(d.leads ?? 0),
          conversionRate: Number(d.conversionRate ?? 0),
          avgCallDuration: Number(d.avgCallDuration ?? d.avgResponseLatency ?? 0),
        }));
      }),
      api.get<CallVolume[]>(`/analytics/call-volume${params}`).catch((e) => {
        if (e?.message?.includes("403") || e?.status === 403) throw e;
        return api.get<CallVolume[]>("/dashboard/call-volume");
      }),
      api.get<FunnelStep[]>(`/analytics/conversion-funnel${params}`).catch((e) => {
        if (e?.message?.includes("403") || e?.status === 403) throw e;
        return api.get<Record<string, number>>("/dashboard/conversion").then((d) => {
          const calls = d.calls ?? 0;
          const leads = d.leads ?? 0;
          const convRate = d.conversionRate ?? 0;
          const converted = calls > 0 ? Math.round(calls * convRate) : 0;
          return [
            { name: t("funnelCalls"), value: calls, percentage: 100 },
            { name: t("funnelLeads"), value: leads, percentage: calls > 0 ? Math.round((leads / calls) * 100) : 0 },
            { name: t("funnelConverted"), value: converted, percentage: calls > 0 ? Math.round((converted / calls) * 100) : 0 },
          ];
        });
      }),
    ])
      .then(([m, cv, f]) => {
        if (m.status === "fulfilled") {
          setMetrics(
            normalizeAnalyticsMetrics(m.value as unknown as Record<string, unknown>)
          );
        }
        if (cv.status === "fulfilled") {
          setCallVolume(
            asArray<Record<string, unknown>>(cv.value).map((row) => ({
              date: String(row.date ?? ""),
              calls: Number(row.calls ?? 0),
              leads: Number(row.leads ?? 0),
              conversions: Number(row.conversions ?? row.appointments ?? 0),
            }))
          );
        }
        if (f.status === "fulfilled") {
          setFunnel(funnelFromApi(f.value) as FunnelStep[]);
        } else if (m.status === "fulfilled" && m.value) {
          setFunnel(funnelFromApi(m.value) as FunnelStep[]);
        }
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [startDate, endDate, t]);

  useRealtimeQuery(
    ["calls", "leads", "metrics", "analytics"],
    () => void fetchData({ withSpinner: false }),
    `${startDate}|${endDate}`,
    { debounceMs: 0, pollMs: DASHBOARD_POLL_MS, pollOnlyWhenDisconnected: true }
  );

  const exportCSV = async () => {
    const params = `?startDate=${startDate}&endDate=${endDate}`;
    const raw = await api
      .get<CallVolume[] | Record<string, unknown>[]>(`/analytics/call-volume${params}`)
      .catch(() => api.get<CallVolume[]>("/dashboard/call-volume"));
    const volume = asArray<Record<string, unknown>>(raw).map(
      (row) => ({
        date: String(row.date ?? ""),
        calls: Number(row.calls ?? 0),
        leads: Number(row.leads ?? 0),
        conversions: Number(row.conversions ?? row.appointments ?? 0),
      })
    );
    if (!volume.length) return;
    const headers = "Date,Calls,Leads,Conversions\n";
    const rows = volume.map((r) => `${r.date},${r.calls},${r.leads},${r.conversions}`).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = async () => {
    setExportingPdf(true);
    setError("");
    try {
      await fetchData({ withSpinner: false });
      await api.downloadBlob(
        `/analytics/export?startDate=${startDate}&endDate=${endDate}&format=pdf`,
        `halla-analytics_${startDate}_${endDate}.pdf`
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "PDF export failed");
    } finally {
      setExportingPdf(false);
    }
  };

  const applyPreset = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    setEndDate(end.toISOString().split("T")[0]);
    setStartDate(start.toISOString().split("T")[0]);
  };

  const dateControls = (
    <div className="flex flex-wrap items-stretch sm:items-center gap-2 w-full min-w-0">
      <div className="flex flex-wrap gap-1.5">
        {[
          { label: "7d", days: 7 },
          { label: "30d", days: 30 },
          { label: "90d", days: 90 },
        ].map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => applyPreset(p.days)}
            className="btn-ghost text-xs px-3 py-2 min-h-[40px] sm:min-h-0"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="dashboard-panel flex flex-wrap items-center gap-2 px-3 py-2 min-w-0 flex-1 sm:flex-initial">
        <Calendar className="w-4 h-4 text-gray-400" />
        <input
          type="date"
          aria-label={t("startDate")}
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="bg-transparent text-sm text-foreground outline-none min-w-0 flex-1 sm:flex-initial max-w-full"
        />
        <span className="text-gray-400">—</span>
        <input
          type="date"
          aria-label={t("endDate")}
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="bg-transparent text-sm text-foreground outline-none min-w-0 flex-1 sm:flex-initial max-w-full"
        />
      </div>
      <button type="button" onClick={exportCSV} className="btn-ghost shrink-0 justify-center" title={t("downloadCsv")}>
        <Download className="w-4 h-4" /> CSV
      </button>
      <button
        type="button"
        onClick={exportPDF}
        disabled={exportingPdf}
        className="btn-blue btn-sm shrink-0 justify-center"
        title={t("downloadPdf")}
      >
        <Download className="w-4 h-4" /> {exportingPdf ? t("exporting") : "PDF"}
      </button>
    </div>
  );

  return (
    <DashboardPage
      title={title}
      description={description}
      actions={dateControls}
      error={error}
      loading={loading && !metrics}
    >
      <div className="dashboard-stat-grid">
        <StatCard label={t("totalCalls")} value={metrics?.totalCalls ?? 0} icon={Phone} iconVariant="accent" index={0} />
        <StatCard label={t("totalLeads")} value={metrics?.totalLeads ?? 0} icon={Users} iconVariant="violet" index={1} />
        <StatCard label={t("conversionRate")} value={`${metrics?.conversionRate ?? 0}%`} icon={TrendingUp} iconVariant="success" index={2} />
        <StatCard label={t("avgDuration")} value={`${metrics?.avgDuration ?? 0}s`} icon={Clock} iconVariant="neutral" index={3} />
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <VibePanel beam className="dashboard-panel-padded rounded-2xl border border-border/70 bg-card shadow-card">
          <SectionHeader icon={TrendingUp} title={t("callVolumeOverTime")} size="sm" className="mb-4" />
        {callVolume.length === 0 ? (
          <div className="min-h-64 flex items-center justify-center">
            <EmptyState
              icon={TrendingUp}
              title={t("noDataPeriod")}
              description={t("noDataPeriodDesc")}
              iconVariant="muted"
            />
          </div>
        ) : (
          <div className="h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={callVolume} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <defs>
                  <linearGradient id="callsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="leadsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent-mid)" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="var(--accent-mid)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="convGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--success)" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="var(--success)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    boxShadow: "var(--shadow-card)",
                    color: "var(--foreground)",
                  }}
                />
                <Area type="monotone" dataKey="calls" stroke="var(--accent)" strokeWidth={2} fill="url(#callsGrad)" />
                <Area type="monotone" dataKey="leads" stroke="var(--accent-mid)" strokeWidth={2} fill="url(#leadsGrad)" />
                <Area type="monotone" dataKey="conversions" stroke="var(--success)" strokeWidth={2} fill="url(#convGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-accent" />
            <span className="text-xs text-foreground-secondary">{t("funnelCalls")}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-accent-mid" />
            <span className="text-xs text-foreground-secondary">{t("funnelLeads")}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-success" />
            <span className="text-xs text-foreground-secondary">{t("chartConversions")}</span>
          </div>
        </div>
        </VibePanel>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="dashboard-panel-padded">
        <SectionHeader icon={Filter} title={t("conversionFunnel")} size="sm" className="mb-6" />
        {funnel.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-foreground-tertiary text-sm">{t("noFunnelData")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {funnel.map((step, i) => (
              <motion.div
                key={step.name}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.1 }}
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 min-w-0"
              >
                <span className="text-sm text-foreground-secondary sm:w-32 shrink-0">{step.name}</span>
                <div className="flex-1 h-10 bg-gray-100 dark:bg-muted rounded-xl overflow-hidden relative min-w-0 w-full">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${step.percentage}%` }}
                    transition={{ duration: 1, delay: 0.6 + i * 0.1 }}
                    className="h-full rounded-xl"
                    style={{
                      background: "linear-gradient(90deg, var(--accent), var(--accent-mid))",
                    }}
                  />
                  <div className="absolute inset-0 flex items-center px-4">
                    <span className="text-sm font-medium text-foreground">{step.value}</span>
                  </div>
                </div>
                <span className="text-sm text-foreground-secondary sm:w-12 shrink-0 text-left sm:text-right">{step.percentage}%</span>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </DashboardPage>
  );
}
