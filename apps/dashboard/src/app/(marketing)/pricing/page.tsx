import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { PricingGrid } from "@/components/marketing/PricingGrid";
import { CtaBlock } from "@/components/marketing/CtaBlock";
import { fetchPublicPlansServer } from "@/lib/public-api";

export const metadata = { title: "Pricing | Call IQ" };
// Force per-request rendering — static generation intermittently froze this
// page's Suspense boundary mid-stream (content correct but hidden forever).
// Also ensures live plan data isn't stuck on a stale ISR snapshot.
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const livePlans = await fetchPublicPlansServer();

  return (
    <MarketingShell>
      <PageHero
        label="Pricing"
        title="Simple, Honest Pricing"
        subtitle="14-day free trial. No credit card required. Cancel anytime."
      />
      <section className="section">
        <div className="container">
          <PricingGrid initialPlans={livePlans} />
          <div className="card" style={{ maxWidth: 680, margin: "56px auto" }}>
            <h3 style={{ marginBottom: 18 }}>💰 Save 20% — Annual Billing</h3>
            <div className="table-wrap">
              <table className="comp-table">
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Annual</th>
                    <th>Effective / Month</th>
                    <th>You Save</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Essential</td>
                    <td>$375/year</td>
                    <td>$31.25</td>
                    <td className="yes">Save $93/year</td>
                  </tr>
                  <tr>
                    <td>Professional</td>
                    <td>$1,430/year</td>
                    <td>$119.17</td>
                    <td className="yes">Save $358/year</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <h3 style={{ textAlign: "center", marginBottom: 24 }}>Full Feature Comparison</h3>
          <div className="table-wrap" style={{ marginBottom: 56 }}>
            <table className="comp-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Essential</th>
                  <th>Professional</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Monthly price</td>
                  <td>$39</td>
                  <td>$149</td>
                </tr>
                <tr>
                  <td>Included minutes</td>
                  <td>250</td>
                  <td>750</td>
                </tr>
                <tr>
                  <td>HIPAA compliance</td>
                  <td className="no">—</td>
                  <td className="no">—</td>
                </tr>
                <tr>
                  <td>Call recording</td>
                  <td colSpan={2} style={{ color: "var(--gray-400)" }}>
                    Opt-in, off by default on every plan
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <CtaBlock
            title="Try Call IQ Risk-Free"
            description="14-day free trial. No credit card. Cancel anytime."
            secondaryHref="/roi"
            secondaryLabel="Calculate My ROI"
          />
        </div>
      </section>
    </MarketingShell>
  );
}
