"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { api, humanizeApiError } from "@/lib/api";

interface UsageRow { tenantId: string; name: string; calls: number; minutes: number; estimatedCostUsd: number }
interface UsagePeriod { days: number; rows: UsageRow[]; totals: { calls: number; minutes: number; estimatedCostUsd: number } }
interface UsageData {
  periods: UsagePeriod[];
  rates: { phoneUsdPerMinute: number; aiUsdPerMinute: number };
  alerts: { kind: string; title: string; at: string }[];
}

const usd = (n: number) => `$${n.toFixed(2)}`;

/** Team only (the layout and the gateway both check). Every figure is an estimate from call length, not a bill. */
export default function Page() {
  const [data, setData] = useState<UsageData | null>(null);
  const [days, setDays] = useState<7 | 30>(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api.get<UsageData>("/consultancy-admin/usage", { fresh: true }));
      setError("");
    } catch (e) {
      setError(humanizeApiError(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const period = data?.periods.find((p) => p.days === days);
  return (
    <DashboardPage title="Usage and cost" description="Calls and estimated cost per client" loading={loading} error={error || undefined} onRetry={load}>
      {data && period && (
        <div className="space-y-6">
          <div className="flex gap-2">
            {([7, 30] as const).map((d) => (
              <button key={d} type="button" onClick={() => setDays(d)} aria-pressed={days === d} className={`rounded-md border px-3 py-1.5 text-sm ${days === d ? "bg-foreground text-background" : ""}`}>
                Last {d} days
              </button>
            ))}
          </div>
          <p className="text-sm">
            <strong>{period.totals.calls}</strong> calls, <strong>{period.totals.minutes}</strong> minutes, about <strong>{usd(period.totals.estimatedCostUsd)}</strong> in total.
          </p>
          {period.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No calls in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-4">Client</th>
                    <th className="py-2 pr-4">Calls</th>
                    <th className="py-2 pr-4">Minutes</th>
                    <th className="py-2">Estimated cost</th>
                  </tr>
                </thead>
                <tbody>
                  {period.rows.map((r) => (
                    <tr key={r.tenantId} className="border-b">
                      <td className="py-2 pr-4">{r.name}</td>
                      <td className="py-2 pr-4">{r.calls}</td>
                      <td className="py-2 pr-4">{r.minutes}</td>
                      <td className="py-2">{usd(r.estimatedCostUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Estimates only: minutes × ({usd(data.rates.phoneUsdPerMinute)} phone + {usd(data.rates.aiUsdPerMinute)} AI) a minute. Not a bill, and it shows no profit.
          </p>
          <section>
            <h2 className="text-base font-semibold">Recent team alerts</h2>
            {data.alerts.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">No alert emails sent since the gateway last restarted.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {data.alerts.map((a, i) => (
                  <li key={`${a.at}-${i}`}>
                    {a.title} <span className="text-muted-foreground">({new Date(a.at).toLocaleString()})</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted-foreground">This list is kept in memory and clears when the gateway restarts.</p>
          </section>
        </div>
      )}
    </DashboardPage>
  );
}
