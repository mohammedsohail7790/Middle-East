import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";

export const metadata = { title: "Security | Halla AI" };

export default function SecurityPage() {
  return (
    <MarketingShell>
      <PageHero
        label="Security"
        title="Enterprise-Grade Security"
        subtitle="Your data and your callers' data are protected at every layer."
      />
      <section className="section">
        <div className="container-sm">
          <div className="alert alert-warn">
            <span>⚠️</span>
            <span className="alert-text">
              Halla AI is <strong>not HIPAA-compliant</strong> on Essential or Professional plans. A signed BAA
              is not currently offered on any plan.
            </span>
          </div>
          <div className="grid-2" style={{ marginTop: 36, gap: 16 }}>
            {[
              { t: "Encryption in transit & at rest", d: "TLS 1.3 for all data in transit. AES-256 encryption at rest." },
              { t: "SOC 2 Type II (in progress)", d: "Annual third-party audits of our security controls." },
              { t: "GDPR & CCPA compliant", d: "Data processing agreements available. Right to deletion honored." },
              { t: "Call recording is opt-in", d: "Off by default on every plan. Enable it in Compliance Settings with a recording announcement and consent controls." },
              { t: "Role-based access", d: "Team members see only what they need. Admin controls for every account." },
              { t: "99.9% uptime target", d: "Contractual SLA credits are not currently offered on any plan." },
            ].map((c) => (
              <div key={c.t} className="card">
                <h4 style={{ marginBottom: 8 }}>{c.t}</h4>
                <p style={{ fontSize: "0.875rem" }}>{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
