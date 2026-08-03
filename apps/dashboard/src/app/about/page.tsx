import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";

export const metadata = { title: "About | Call IQ" };

export default function AboutPage() {
  return (
    <MarketingShell>
      <PageHero
        label="Our Story"
        title={
          <>
            Built by Business Owners,
            <br />
            for Business Owners
          </>
        }
        subtitle="Smart · Seamless · Always"
      />
      <section className="section">
        <div className="container-sm">
          <p style={{ fontSize: "1.05rem", marginBottom: 24 }}>
            Call IQ was founded in 2025 by a team of former small business owners and AI engineers. We saw the same
            problem everywhere: brilliant plumbers, lawyers, and mechanics were missing calls — not because they were
            lazy, but because they were working.
          </p>
          <p style={{ marginBottom: 40 }}>
            Every missed call was a customer going to a competitor. Voicemail meant customers hung up. Live answering
            services cost $2,000+/month. So we built something different.
          </p>
          <div className="grid-2" style={{ marginBottom: 48, gap: 16 }}>
            {[
              { t: "Pure AI. No humans.", d: "Modern AI handles 90% of business calls. Why pay for a human to ask for a phone number?" },
              { t: "Transparency by choice.", d: "We recommend AI disclosure on every call. It builds trust and keeps you legally compliant." },
              { t: "Call recording, if you need it.", d: "Off by default on every plan. Turn it on with built-in compliance warnings and consent controls." },
              { t: "Real support.", d: "Live chat with real humans, 7am–3pm ET. Email support 24/7." },
            ].map((c) => (
              <div key={c.t} className="card">
                <h4 style={{ marginBottom: 8 }}>{c.t}</h4>
                <p style={{ fontSize: "0.875rem" }}>{c.d}</p>
              </div>
            ))}
          </div>
          <h3 style={{ marginBottom: 20 }}>Our Commitments</h3>
          <div style={{ display: "grid", gap: 12 }}>
            {[
              { e: "🎁", t: "14-day free trial — no credit card, no questions asked." },
              { e: "💰", t: "No hidden fees — what you see is what you pay." },
              { e: "🇺🇸", t: "US-based support — live chat 7am–3pm ET, email 24/7." },
              { e: "🔒", t: "GDPR/CCPA compliant — your data is your data. We never sell it." },
            ].map((c) => (
              <div key={c.t} className="card" style={{ display: "flex", gap: 14, alignItems: "center", padding: 18 }}>
                <span style={{ fontSize: "1.4rem" }}>{c.e}</span>
                <div>
                  <strong>{c.t}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
