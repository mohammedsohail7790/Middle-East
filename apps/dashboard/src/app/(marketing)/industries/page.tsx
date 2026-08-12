import Link from "next/link";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { INDUSTRIES_LIST } from "@/lib/marketing-pages";

export const metadata = { title: "Industries | Halla AI" };

export default function IndustriesPage() {
  return (
    <MarketingShell>
      <PageHero
        label="Industries"
        title="Industries We Serve"
        subtitle="50+ industries. Pre-configured. Ready in minutes."
      />
      <section className="section">
        <div className="container">
          <div className="grid-4" style={{ gap: 20 }}>
            {INDUSTRIES_LIST.map((ind) => (
              <Link key={ind.slug} href={`/industries/${ind.slug}`} className="ind-card">
                <div className="ind-icon">{ind.icon}</div>
                <h4>{ind.title}</h4>
                <p>{ind.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
