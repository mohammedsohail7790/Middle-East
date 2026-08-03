"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchPublicPlans } from "@/lib/public-api";

const FALLBACK_PLANS = [
  { key: "essential", price: 39, label: "Essential — $39/mo" },
  { key: "professional", price: 149, label: "Professional — $149/mo" },
];

export function RoiCalculator() {
  const [planOptions, setPlanOptions] = useState(FALLBACK_PLANS);
  const [missed, setMissed] = useState(20);
  const [value, setValue] = useState(500);
  const [conv, setConv] = useState(30);
  const [plan, setPlan] = useState(149);

  useEffect(() => {
    fetchPublicPlans()
      .then((data) => {
        const order = ["essential", "professional"] as const;
        const next = order
          .filter((k) => data[k])
          .map((k) => ({
            key: k,
            price: data[k].price,
            label: `${data[k].name} — $${data[k].price}/mo`,
          }));
        if (next.length) {
          setPlanOptions(next);
          const pro = next.find((p) => p.key === "professional");
          setPlan(pro?.price ?? next[0].price);
        }
      })
      .catch(() => {});
  }, []);

  const { monthly, annual, cost, net, mult } = useMemo(() => {
    const monthlyRecovered = missed * (conv / 100) * value;
    const annualRecovered = monthlyRecovered * 12;
    const annualCost = plan * 12;
    const netRoi = annualRecovered - annualCost;
    const multiplier = annualCost > 0 ? Math.round(annualRecovered / annualCost) : 0;
    return {
      monthly: monthlyRecovered,
      annual: annualRecovered,
      cost: annualCost,
      net: netRoi,
      mult: multiplier,
    };
  }, [missed, value, conv, plan]);

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <div className="grid-2" style={{ gap: 48, maxWidth: 880, margin: "0 auto", alignItems: "start" }}>
      <div className="roi-wrap">
        <h3 style={{ marginBottom: 24 }}>Your Business</h3>
        <div className="roi-group">
          <label className="roi-label">Monthly Calls You Currently Miss</label>
          <input
            className="roi-input"
            type="number"
            value={missed}
            onChange={(e) => setMissed(Number(e.target.value) || 0)}
          />
        </div>
        <div className="roi-group">
          <label className="roi-label">Average Job / Sale Value ($)</label>
          <input
            className="roi-input"
            type="number"
            value={value}
            onChange={(e) => setValue(Number(e.target.value) || 0)}
          />
        </div>
        <div className="roi-group">
          <label className="roi-label">% of Answered Calls That Convert</label>
          <input
            className="roi-input"
            type="number"
            min={1}
            max={100}
            value={conv}
            onChange={(e) => setConv(Number(e.target.value) || 0)}
          />
        </div>
        <div className="roi-group">
          <label className="roi-label">Plan</label>
          <select className="roi-select" value={plan} onChange={(e) => setPlan(Number(e.target.value))}>
            {planOptions.map((p) => (
              <option key={p.key} value={p.price}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <div className="roi-result highlight">
          <div className="roi-result-num">{fmt(monthly)}</div>
          <div className="roi-result-label">Monthly Revenue Recovered</div>
        </div>
        <div className="roi-result" style={{ marginTop: 12 }}>
          <div className="roi-result-num">{fmt(annual)}</div>
          <div className="roi-result-label">Annual Revenue Recovered</div>
        </div>
        <div className="roi-result" style={{ marginTop: 12 }}>
          <div className="roi-result-num" style={{ color: "var(--gray-500)" }}>
            {fmt(cost)}
          </div>
          <div className="roi-result-label">Annual Call IQ Cost</div>
        </div>
        <div className="roi-result highlight" style={{ marginTop: 12 }}>
          <div className="roi-result-num">{fmt(net)}</div>
          <div className="roi-result-label">Net Annual ROI — {mult}x your investment</div>
        </div>
        <Link href="/signup" className="btn btn-primary btn-lg" style={{ width: "100%", marginTop: 20, display: "flex" }}>
          Start Free Trial — Capture This Revenue →
        </Link>
      </div>
    </div>
  );
}
