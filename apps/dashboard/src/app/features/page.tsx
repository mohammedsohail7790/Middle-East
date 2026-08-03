import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { CtaBlock } from "@/components/marketing/CtaBlock";
import { FEATURES_CORE, FEATURES_PRO } from "@/lib/marketing-pages";

export const metadata = { title: "Features | Call IQ" };
// Force per-request rendering — static generation intermittently froze this
// page's Suspense boundary mid-stream (content correct but hidden forever).
export const dynamic = "force-dynamic";

export default function FeaturesPage() {
  return (
    <MarketingShell>
      <PageHero
        label="Features"
        title="Everything You Need in an AI Receptionist"
        subtitle="24/7/365 AI-powered call handling. No live agents. No hidden fees."
      />
      <section className="section">
        <div className="container">
          <h3 style={{ marginBottom: 28 }}>✅ All Plans — Core Features</h3>
          <div style={{ marginBottom: 56 }}>
            <FeatureGrid items={FEATURES_CORE} />
          </div>
          <h3 style={{ marginBottom: 28 }}>⭐ Professional</h3>
          <FeatureGrid items={FEATURES_PRO} />
          <div style={{ marginTop: 56, textAlign: "center" }}>
            <CtaBlock
              title="Try Every Feature Free for 14 Days"
              description="No credit card. All features unlocked on your trial."
              secondaryHref="/pricing"
              secondaryLabel="View Pricing"
            />
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
