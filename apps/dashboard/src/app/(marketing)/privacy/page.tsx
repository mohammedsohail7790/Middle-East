import Link from "next/link";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { SUPPORT_EMAIL } from "@/lib/integration-support";

export const metadata = { title: "Privacy Policy | Call IQ" };

export default function PrivacyPage() {
  return (
    <MarketingShell>
      <PageHero label="Legal" title="Privacy Policy" subtitle="How Call IQ handles your data." />
      <section className="section">
        <div className="container container-sm">
          <p style={{ marginBottom: 20 }}>
            Call IQ Labs collects account, billing, and call metadata needed to operate your AI receptionist.
            We do not sell personal data. Customers may request a Data Processing Agreement.
          </p>
          <p style={{ marginBottom: 20 }}>
            For privacy requests (access, correction, deletion), contact{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: "var(--accent)" }}>
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
          <p style={{ marginBottom: 32 }}>
            AI disclosure on calls is enabled by default where required by law. See our security page for
            infrastructure details.
          </p>
          <Link href="/signup" className="btn btn-primary">
            Start free trial →
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
