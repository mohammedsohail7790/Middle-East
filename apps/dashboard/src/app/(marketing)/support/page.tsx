import Link from "next/link";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { ContactForm } from "@/components/marketing/ContactForm";
import { CtaBlock } from "@/components/marketing/CtaBlock";

export const metadata = { title: "Support | Halla AI" };
// Force per-request rendering — static generation intermittently froze this
// page's Suspense boundary mid-stream (content correct but hidden forever).
export const dynamic = "force-dynamic";

export default function SupportPage() {
  return (
    <MarketingShell>
      <PageHero
        label="Support"
        title="We're Here to Help"
        subtitle="Email us, chat live, or send a quick message below. We usually respond within a few hours."
      />
      <section className="section">
        <div className="container" style={{ maxWidth: 640 }}>
          <ContactForm />

          <div style={{ textAlign: "center", marginTop: 8, marginBottom: 40 }}>
            <p style={{ fontSize: "0.9rem", color: "var(--gray-500)" }}>
              Prefer to browse answers yourself?{" "}
              <Link href="/docs" style={{ color: "var(--accent)", fontWeight: 600 }}>
                Visit the Help Center
              </Link>{" "}
              or check the{" "}
              <Link href="/faq" style={{ color: "var(--accent)", fontWeight: 600 }}>
                FAQ
              </Link>
              .
            </p>
          </div>

          <CtaBlock
            label="Get Started"
            title="Ready to never miss a call again?"
            description="14-day free trial. No credit card required."
            primaryHref="/signup"
            primaryLabel="Start Free Trial →"
            secondaryHref="/pricing"
            secondaryLabel="View Pricing"
          />
        </div>
      </section>
    </MarketingShell>
  );
}
