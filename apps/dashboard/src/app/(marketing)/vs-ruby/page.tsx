import Link from "next/link";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";

export const metadata = { title: "Call IQ vs Ruby" };

export default function VsRubyPage() {
  return (
    <MarketingShell>
      <PageHero label="Comparison" title="Call IQ vs. Ruby" subtitle="An honest, side-by-side comparison." />
      <section className="section">
        <div className="container">
          <div className="table-wrap" style={{ marginBottom: 36 }}>
            <table className="comp-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Call IQ Professional</th>
                  <th>Ruby</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Monthly price</td>
                  <td>$149</td>
                  <td>$140+</td>
                </tr>
                <tr>
                  <td>Live agents</td>
                  <td className="no">Pure AI</td>
                  <td className="yes">100% human</td>
                </tr>
                <tr>
                  <td>24/7 coverage</td>
                  <td className="yes">Included</td>
                  <td>Extra cost</td>
                </tr>
                <tr>
                  <td>Effective cost at 2,000 min</td>
                  <td>$386.50</td>
                  <td>$1,085+</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="comp-highlight" style={{ maxWidth: 680, margin: "0 auto 48px" }}>
            <h4 style={{ marginBottom: 10 }}>Our Verdict</h4>
            <p style={{ fontSize: "0.9rem" }}>
              Call IQ is significantly more affordable than Ruby at any call volume. Choose Ruby only if you require a
              live human voice on every single call.
            </p>
          </div>
          <div className="text-center">
            <Link href="/signup" className="btn btn-primary btn-lg">
              Try Call IQ Free →
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
