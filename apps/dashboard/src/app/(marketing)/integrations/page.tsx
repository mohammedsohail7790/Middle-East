import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { CtaBlock } from "@/components/marketing/CtaBlock";
import { INTEGRATION_GROUPS } from "@/lib/marketing-pages";

export const metadata = { title: "Integrations | Call IQ" };

export default function IntegrationsPage() {
  return (
    <MarketingShell>
      <PageHero
        label="Integrations"
        title="Works With Everything You Already Use"
        subtitle="Native integrations, Zapier, and a REST API. 5,000+ apps."
      />
      <section className="section">
        <div className="container">
          <div className="grid-2" style={{ gap: 48 }}>
            {INTEGRATION_GROUPS.map((g) => (
              <div key={g.title}>
                <h3 style={{ marginBottom: 16 }}>{g.title}</h3>
                <div className="pills-wrap">
                  {g.items.map((name) => (
                    <span key={name} className="pill">
                      <span className="pill-dot" />
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 56, textAlign: "center" }}>
            <CtaBlock
              title="Don't See Your Tool?"
              description="If your software connects to Zapier, it connects to Call IQ. 5,000+ apps."
            />
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
