import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { RoiCalculator } from "@/components/marketing/RoiCalculator";

export const metadata = { title: "ROI Calculator | Call IQ" };

export default function RoiPage() {
  return (
    <MarketingShell>
      <PageHero
        label="ROI Calculator"
        title="Calculate Your Return"
        subtitle="See exactly how fast Call IQ pays for itself."
      />
      <section className="section">
        <div className="container">
          <RoiCalculator />
        </div>
      </section>
    </MarketingShell>
  );
}
