import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { CtaBlock } from "@/components/marketing/CtaBlock";
import { ContactForm } from "@/components/marketing/ContactForm";

export const metadata = { title: "Contact Us | Call IQ" };
// Force per-request rendering — static generation intermittently froze this
// page's Suspense boundary mid-stream (content correct but hidden forever).
export const dynamic = "force-dynamic";

export default function ContactPage() {
  return (
    <MarketingShell>
      <PageHero
        label="Get in Touch"
        title="Let's Talk"
        subtitle="Have questions about Call IQ? We're here to help. Reach out via email or our live chat."
      />
      <section className="section">
        <div className="container" style={{ maxWidth: 640 }}>
          <ContactForm />

          <div style={{ textAlign: "center", marginTop: 24 }}>
            <p style={{ fontSize: "0.9rem", color: "var(--gray-500)" }}>
              Prefer to talk? Reach us via the live chat bubble at the bottom right of your screen.
              <br />
              Our support team is ready to assist.
            </p>
          </div>

          <div style={{ marginTop: 48 }}>
            <CtaBlock
              label="Start Your Free Trial"
              title="Ready to never miss a call again?"
              description="14-day free trial. No credit card required."
              primaryHref="/signup"
              primaryLabel="Start Free Trial →"
              secondaryHref="/pricing"
              secondaryLabel="View Pricing"
            />
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
