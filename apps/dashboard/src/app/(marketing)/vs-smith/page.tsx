import Link from "next/link";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";

export const metadata = { title: "Halla AI vs Smith.ai" };

export default function VsSmithPage() {
  return (
    <MarketingShell>
      <PageHero label="Comparison" title="Halla AI vs. Smith.ai" subtitle="An honest, side-by-side comparison." />
      <section className="section">
        <div className="container">
          <div className="table-wrap" style={{ marginBottom: 36 }}>
            <table className="comp-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Halla AI Essential</th>
                  <th>Halla AI Professional</th>
                  <th>Smith.ai</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Monthly price</td>
                  <td>$39</td>
                  <td>$149</td>
                  <td>$97.50+</td>
                </tr>
                <tr>
                  <td>Live agents</td>
                  <td className="no">Pure AI</td>
                  <td className="no">Pure AI</td>
                  <td className="yes">Yes (hybrid)</td>
                </tr>
                <tr>
                  <td>Free trial (no CC)</td>
                  <td className="yes">✓ 14 days</td>
                  <td className="yes">✓ 14 days</td>
                  <td className="no">CC required</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="comp-highlight" style={{ maxWidth: 680, margin: "0 auto 48px" }}>
            <h4 style={{ marginBottom: 10 }}>Our Verdict</h4>
            <p style={{ fontSize: "0.9rem" }}>
              Choose <strong>Halla AI</strong> for pure AI, lower pricing, and recording that&apos;s off by default with built-in compliance controls. Choose{" "}
              <strong>Smith.ai</strong> if you specifically need live human agents.
            </p>
          </div>
          <div className="text-center">
            <Link href="/signup" className="btn btn-primary btn-lg">
              Try Halla AI Free →
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
