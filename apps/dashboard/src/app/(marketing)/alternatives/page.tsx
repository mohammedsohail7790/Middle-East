import Link from "next/link";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";

export const metadata = { title: "Alternatives | Call IQ" };

export default function AlternativesPage() {
  return (
    <MarketingShell>
      <PageHero
        label="Compare"
        title="Call IQ vs. The Competition"
        subtitle="Honest comparison against Smith.ai, Ruby, and SkipCalls."
      />
      <section className="section">
        <div className="container">
          <div className="table-wrap" style={{ marginBottom: 48 }}>
            <table className="comp-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Call IQ</th>
                  <th>Smith.ai</th>
                  <th>Ruby</th>
                  <th>SkipCalls</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Essential monthly price</td>
                  <td className="yes">$39</td>
                  <td>$97.50+</td>
                  <td>$140+</td>
                  <td>$16.58*</td>
                </tr>
                <tr>
                  <td>Pure AI (no humans)</td>
                  <td className="yes">✓ Yes</td>
                  <td className="no">No (hybrid)</td>
                  <td className="no">No (human)</td>
                  <td className="yes">Yes</td>
                </tr>
                <tr>
                  <td>Free trial (no CC)</td>
                  <td className="yes">✓ 14 days</td>
                  <td className="no">CC required</td>
                  <td className="no">CC required</td>
                  <td className="yes">7 days</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="text-center">
            <Link href="/signup" className="btn btn-primary btn-lg">
              Try Call IQ Free — No Credit Card →
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
