import Link from "next/link";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { CtaBlock } from "@/components/marketing/CtaBlock";

export const metadata = { title: "Help Center | Halla AI" };
// Force per-request rendering — static generation intermittently froze this
// page's Suspense boundary mid-stream (content correct but hidden forever).
export const dynamic = "force-dynamic";

type DocLink = { label: string; href: string };

type DocSection = {
  icon: string;
  iconClass: string;
  title: string;
  description: string;
  links: DocLink[];
};

const SECTIONS: DocSection[] = [
  {
    icon: "🚀",
    iconClass: "feat-icon-blue",
    title: "Getting Started",
    description: "Set up your AI receptionist and start taking calls in minutes.",
    links: [
      { label: "How Halla AI Works", href: "/how-it-works" },
      { label: "Call Forwarding Setup Guides", href: "/forwarding" },
      { label: "Plans & Pricing", href: "/pricing" },
      { label: "Start Free Trial", href: "/signup" },
    ],
  },
  {
    icon: "🛡️",
    iconClass: "feat-icon-green",
    title: "Compliance & Call Consent",
    description: "How call recording, transcription, and caller consent work.",
    links: [
      { label: "Security & Compliance Overview", href: "/security" },
      { label: "Dashboard: Compliance Settings", href: "/dashboard/compliance" },
      { label: "Privacy Policy", href: "/privacy" },
    ],
  },
  {
    icon: "🕒",
    iconClass: "feat-icon-orange",
    title: "Business Hours & Knowledge",
    description: "Update your hours, services, and how the AI answers questions.",
    links: [
      { label: "Dashboard: Knowledge", href: "/dashboard/knowledge" },
      { label: "Dashboard: Settings", href: "/dashboard/settings" },
    ],
  },
  {
    icon: "💬",
    iconClass: "feat-icon-green",
    title: "Still Need Help?",
    description: "Reach the team directly or browse frequently asked questions.",
    links: [
      { label: "FAQ", href: "/faq" },
      { label: "Support", href: "/support" },
      { label: "Dashboard: Support", href: "/dashboard/support" },
    ],
  },
];

export default function DocsPage() {
  return (
    <MarketingShell>
      <PageHero
        label="Help Center"
        title="How Can We Help?"
        subtitle="Guides and answers for setting up and running your AI receptionist."
      />
      <section className="section">
        <div className="container">
          <div className="grid-3" style={{ gap: 20 }}>
            {SECTIONS.map((s) => (
              <div key={s.title} className={`card${s.iconClass === "feat-icon-blue" ? " card-blue" : ""}`}>
                <div className={`feat-icon ${s.iconClass}`.trim()}>{s.icon}</div>
                <h4 style={{ marginTop: 14 }}>{s.title}</h4>
                <p style={{ marginTop: 8, marginBottom: 16, fontSize: "0.875rem" }}>{s.description}</p>
                <div style={{ display: "grid", gap: 4 }}>
                  {s.links.map((l) => (
                    <Link key={l.href} href={l.href} className="card-link">
                      {l.label} →
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 56 }}>
            <CtaBlock
              label="Get Started"
              title="Ready to never miss a call again?"
              description="14-day free trial. No credit card required."
              primaryHref="/signup"
              primaryLabel="Start Free Trial →"
              secondaryHref="/support"
              secondaryLabel="Contact Support"
            />
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
