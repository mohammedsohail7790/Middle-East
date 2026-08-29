"use client";

import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ROI_PLAN_OPTIONS } from "@/content/pricing";

function formatCurrency(value: number): string {
  return "$" + Math.round(value).toLocaleString("en-US");
}

export function RoiCalculator() {
  const [missedCalls, setMissedCalls] = useState(20);
  const [jobValue, setJobValue] = useState(500);
  const [conversionRate, setConversionRate] = useState(30);
  const [plan, setPlan] = useState(149);

  const monthly = Math.round(missedCalls * (conversionRate / 100) * jobValue);
  const annual = monthly * 12;
  const cost = plan * 12;
  const net = Math.max(0, annual - cost);
  const multiplier = cost > 0 ? (annual / cost).toFixed(1) : "∞";

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
      <div className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold text-foreground">Your Business</h3>

        <label className="flex flex-col gap-1.5 text-sm text-foreground-secondary">
          Monthly Calls You Currently Miss
          <input
            type="number"
            aria-label="Monthly Calls You Currently Miss"
            value={missedCalls}
            onChange={(e) => setMissedCalls(Number(e.target.value) || 0)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-foreground"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm text-foreground-secondary">
          Average Job / Sale Value ($)
          <input
            type="number"
            aria-label="Average Job / Sale Value ($)"
            value={jobValue}
            onChange={(e) => setJobValue(Number(e.target.value) || 0)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-foreground"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm text-foreground-secondary">
          % of Answered Calls That Convert
          <input
            type="number"
            min={1}
            max={100}
            aria-label="% of Answered Calls That Convert"
            value={conversionRate}
            onChange={(e) => setConversionRate(Number(e.target.value) || 0)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-foreground"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm text-foreground-secondary">
          Plan
          <select
            aria-label="Plan"
            value={plan}
            onChange={(e) => setPlan(Number(e.target.value))}
            className="rounded-lg border border-border bg-card px-3 py-2 text-foreground"
          >
            {ROI_PLAN_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <div className="rounded-xl border border-primary bg-primary/10 p-5">
          <p className="text-2xl font-bold text-foreground">{formatCurrency(monthly)}</p>
          <p className="text-sm text-foreground-secondary">Monthly Revenue Recovered</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-2xl font-bold text-foreground">{formatCurrency(annual)}</p>
          <p className="text-sm text-foreground-secondary">Annual Revenue Recovered</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-2xl font-bold text-foreground-secondary">{formatCurrency(cost)}</p>
          <p className="text-sm text-foreground-secondary">Annual Halla AI Cost</p>
        </div>
        <div className="rounded-xl border border-primary bg-primary/10 p-5">
          <p className="text-2xl font-bold text-foreground">{formatCurrency(net)}</p>
          <p className="text-sm text-foreground-secondary">
            Net Annual ROI — {multiplier}x your investment
          </p>
        </div>
        <Button asChild size="lg" className="mt-2 w-full">
          <Link href="/signup">Start Free Trial — Capture This Revenue</Link>
        </Button>
      </div>
    </div>
  );
}
