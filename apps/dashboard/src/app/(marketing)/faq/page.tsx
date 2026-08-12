import Link from "next/link";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { FaqList } from "@/components/marketing/FaqList";
import { FAQ_FULL } from "@/lib/marketing-pages";

export const metadata = { title: "FAQ | Halla AI" };

export default function FaqPage() {
  return (
    <MarketingShell>
      <PageHero
        label="FAQ"
        title="Frequently Asked Questions"
        subtitle="Everything you need to know. 14-day free trial available."
      />
      <section className="section">
        <div className="container-sm">
          <FaqList items={FAQ_FULL} />
          <div style={{ textAlign: "center", marginTop: 48 }}>
            <Link href="/signup" className="btn btn-primary btn-lg">
              Start Free Trial →
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
