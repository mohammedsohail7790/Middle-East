import Link from "next/link";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";

import { SUPPORT_EMAIL } from "@/lib/integration-support";

export const metadata = { title: "Terms of Service | Halla AI" };

export default function TermsPage() {
  return (
    <MarketingShell>
      <PageHero label="Legal" title="Terms of Service" subtitle="Subscription terms for Halla AI." />
      <section className="section">
        <div className="container container-sm">
          <p style={{ marginBottom: 20 }}>
            Plans bill monthly or annually. Trials are 14 days on Essential and Professional unless
            otherwise stated at signup. You may cancel with notice per your plan.
          </p>
          <p style={{ marginBottom: 20 }}>
            Halla AI is a software service provided on an as-available basis.
            Abuse, unlawful robocalling, or circumventing usage limits may result in suspension.
          </p>
          <p style={{ marginBottom: 32 }}>
            Questions:{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: "var(--accent)" }}>
              {SUPPORT_EMAIL}
            </a>
          </p>
          <Link href="/pricing" className="btn btn-outline" style={{ marginRight: 12 }}>
            View pricing
          </Link>
          <Link href="/signup" className="btn btn-primary">
            Start free trial →
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
