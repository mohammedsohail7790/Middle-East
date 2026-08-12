import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { RoiCalculator } from "@/components/marketing/RoiCalculator";

export const metadata = { title: "ROI Calculator | Halla AI" };

export default function RoiPage() {
  return (
    <MarketingShell>
      <PageHero
        label="ROI Calculator"
        title="Calculate Your Return"
        subtitle="See exactly how fast Halla AI pays for itself."
      />
      <section className="section">
        <div className="container">
          <RoiCalculator />
        </div>
      </section>
    </MarketingShell>
  );
}
