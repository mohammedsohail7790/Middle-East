import Link from "next/link";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { HOW_IT_WORKS } from "@/lib/marketing-content";

export const metadata = { title: "How It Works | Call IQ" };

export default function HowItWorksPage() {
  return (
    <MarketingShell>
      <PageHero
        label="Setup"
        title="Live in Under 15 Minutes"
        subtitle="No coding. No IT. Set it up yourself today."
      />
      <section className="section">
        <div className="container-sm">
          {HOW_IT_WORKS.map((s) => (
            <div key={s.n} className="step-row">
              <div className="step-num">{s.n}</div>
              <div>
                <h3 style={{ marginBottom: 8 }}>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            </div>
          ))}
          <div className="alert alert-info" style={{ margin: "32px 0" }}>
            <span>💡</span>
            <span className="alert-text">
              <strong>Pro Tip:</strong> Our live chat support team (7am–3pm ET) can walk you through setup step by
              step, for free.
            </span>
          </div>
          <div className="text-center">
            <Link href="/signup" className="btn btn-primary btn-lg">
              Get Started in 15 Minutes →
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
