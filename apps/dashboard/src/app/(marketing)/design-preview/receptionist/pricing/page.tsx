import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PricingTable } from "@/components/marketing/PricingTable";
import { PricingFeatureTable } from "@/components/marketing/PricingFeatureTable";
import { RoiCalculator } from "@/components/marketing/RoiCalculator";
import { ANNUAL_SAVINGS_ROWS, FEATURE_COMPARISON_ROWS, PRICING_PLANS } from "@/content/pricing";

export const metadata: Metadata = {
  title: "Simple, Honest Pricing — Halla AI",
};

export default function PricingPage() {
  return (
    <div data-brand="receptionist" className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 py-16 sm:px-10 lg:px-16">
        <div className="text-center">
          <span className="text-xs font-semibold uppercase tracking-wide text-primary">Pricing</span>
          <h1 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">
            Simple, Honest Pricing
          </h1>
          <p className="mt-3 text-foreground-secondary">
            14-day free trial. No credit card required. Cancel anytime.
          </p>
        </div>

        <div className="mt-12">
          <PricingTable plans={PRICING_PLANS} />
        </div>

        <div className="mx-auto mt-16 max-w-2xl rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold text-foreground">Save 20% — Annual Billing</h2>
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 font-semibold text-foreground-secondary">Plan</th>
                <th className="py-2 font-semibold text-foreground-secondary">Annual</th>
                <th className="py-2 font-semibold text-foreground-secondary">Effective / Month</th>
                <th className="py-2 font-semibold text-foreground-secondary">You Save</th>
              </tr>
            </thead>
            <tbody>
              {ANNUAL_SAVINGS_ROWS.map((row) => (
                <tr key={row.plan} className="border-b border-border last:border-0">
                  <td className="py-2 font-medium text-foreground">{row.plan}</td>
                  <td className="py-2 text-foreground-secondary">{row.annualPrice}</td>
                  <td className="py-2 text-foreground-secondary">{row.effectiveMonthly}</td>
                  <td className="py-2 text-primary">{row.savings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-16">
          <h2 className="mb-6 text-center text-lg font-semibold text-foreground">
            Full Feature Comparison
          </h2>
          <PricingFeatureTable rows={FEATURE_COMPARISON_ROWS} />
        </div>

        <div className="mt-16 rounded-2xl border border-border bg-card p-8">
          <h2 className="mb-2 text-center text-lg font-semibold text-foreground">
            Calculate Your Return
          </h2>
          <p className="mb-8 text-center text-foreground-secondary">
            See exactly how fast Halla AI pays for itself.
          </p>
          <RoiCalculator />
        </div>

        <div className="mt-16 rounded-2xl border border-border bg-card p-8 text-center">
          <h2 className="text-xl font-bold text-foreground">Try Halla AI Risk-Free</h2>
          <p className="mt-3 text-foreground-secondary">
            14-day free trial. No credit card. Cancel anytime.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/signup">Start Free Trial</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
