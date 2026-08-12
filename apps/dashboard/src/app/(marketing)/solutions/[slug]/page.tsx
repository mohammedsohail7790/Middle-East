import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { SOLUTIONS } from "@/lib/marketing-pages";

export function generateStaticParams() {
  return Object.keys(SOLUTIONS).map((slug) => ({ slug }));
}

export function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return params.then(({ slug }) => {
    const sol = SOLUTIONS[slug];
    return { title: sol ? `${sol.title} | Halla AI` : "Solutions | Halla AI" };
  });
}

export default async function SolutionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sol = SOLUTIONS[slug];
  if (!sol) notFound();

  return (
    <MarketingShell>
      <PageHero label="Solutions" title={sol.title} subtitle={sol.subtitle} />
      <section className="section">
        <div className="container container-sm">
          {sol.body.map((p) => (
            <p key={p} style={{ fontSize: "1.05rem", marginBottom: 20 }}>
              {p}
            </p>
          ))}
          <ul style={{ marginBottom: 40, paddingLeft: 20, color: "var(--gray-600)", lineHeight: 2 }}>
            {sol.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <div className="text-center">
            <Link href="/signup" className="btn btn-primary btn-lg">
              Start Free Trial →
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
