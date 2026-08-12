import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { CtaBlock } from "@/components/marketing/CtaBlock";

export const metadata = { title: "AI vs Human | Halla AI" };

export default function AiVsHumanPage() {
  return (
    <MarketingShell>
      <PageHero
        label="Comparison"
        title="AI vs. Human Receptionist"
        subtitle="The 2025 Cost-Benefit Analysis. Which is right for your business?"
      />
      <section className="section">
        <div className="container">
          <h3 style={{ marginBottom: 20 }}>Annual Cost Comparison</h3>
          <div className="table-wrap" style={{ marginBottom: 48 }}>
            <table className="comp-table">
              <thead>
                <tr>
                  <th>Expense</th>
                  <th>Human FTE</th>
                  <th>Human Agency</th>
                  <th>Halla AI</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Salary / wages</td>
                  <td>$35,000</td>
                  <td>$24,000</td>
                  <td className="yes">N/A</td>
                </tr>
                <tr>
                  <td>Benefits (health, PTO)</td>
                  <td>$8,000</td>
                  <td>Included</td>
                  <td className="yes">$0</td>
                </tr>
                <tr>
                  <td>
                    <strong>Total annual cost</strong>
                  </td>
                  <td>
                    <strong>$52,700</strong>
                  </td>
                  <td>
                    <strong>$26,000</strong>
                  </td>
                  <td className="yes">
                    <strong>$375–$4,790</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="grid-2" style={{ marginBottom: 48 }}>
            <div className="card">
              <h4 style={{ marginBottom: 16, color: "var(--gray-600)" }}>When to Choose Human</h4>
              <p style={{ fontSize: "0.875rem", lineHeight: 2.2 }}>
                • Highly emotional calls (crisis, death claims)
                <br />• HIPAA-covered medical / mental health
                <br />• Customers who refuse AI
                <br />• Very low volume (&lt;5 calls/day)
              </p>
            </div>
            <div className="card card-blue">
              <h4 style={{ marginBottom: 16, color: "var(--accent)" }}>When to Choose Halla AI</h4>
              <p style={{ fontSize: "0.875rem", lineHeight: 2.2 }}>
                • Transactional calls (booking, pricing, hours)
                <br />• Save $20,000–$50,000/year
                <br />• Need 24/7 without shift management
                <br />• Want every call logged in CRM
              </p>
            </div>
          </div>
          <CtaBlock title="Try Halla AI Free for 14 Days" description="Call your own AI receptionist. If you don't love it, keep your money." />
        </div>
      </section>
    </MarketingShell>
  );
}
