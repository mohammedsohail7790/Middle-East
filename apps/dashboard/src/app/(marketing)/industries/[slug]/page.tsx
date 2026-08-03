import Link from "next/link";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { FaqList } from "@/components/marketing/FaqList";
import { INDUSTRY_PAGES } from "@/lib/marketing-pages";

export function generateStaticParams() {
  return Object.keys(INDUSTRY_PAGES).map((slug) => ({ slug }));
}

// Force per-request rendering — static generation intermittently froze this
// page's Suspense boundary mid-stream (content correct but hidden forever).
export const dynamic = "force-dynamic";

export function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return params.then(({ slug }) => {
    const ind = INDUSTRY_PAGES[slug] ?? { title: slug };
    return { title: `${ind.title} | Call IQ` };
  });
}

function industryContent(slug: string) {
  if (INDUSTRY_PAGES[slug]) return INDUSTRY_PAGES[slug];
  const title = slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return {
    title,
    subtitle: "AI receptionist built for your trade",
    intro: `Call IQ answers every call for ${title} businesses — 24/7. Book jobs, capture leads, and route emergencies while your team stays in the field.`,
    useCases: [
      "24/7 call answering with your business name",
      "Lead capture and instant SMS/email summaries",
      "Appointment booking and calendar sync",
      "Emergency triage and on-call routing",
    ],
  };
}

export default async function IndustryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ind = industryContent(slug);

  return (
    <MarketingShell>
      <PageHero label="Industries" title={ind.title} subtitle={ind.subtitle} />
      <section className="section">
        <div className="container container-sm">
          <p style={{ fontSize: "1.05rem", marginBottom: 32 }}>{ind.intro}</p>

          {ind.sections?.map((s) => (
            <div key={s.heading} style={{ marginBottom: 28 }}>
              <h3 style={{ marginBottom: 10 }}>{s.heading}</h3>
              <p style={{ color: "var(--gray-600)" }}>{s.body}</p>
            </div>
          ))}

          {ind.differentiators ? (
            <>
              <h3 style={{ marginBottom: 16 }}>What sets Call IQ apart</h3>
              <div style={{ display: "grid", gap: 10, marginBottom: 40 }}>
                {ind.differentiators.map((d) => (
                  <div key={d} className="pricing-feature" style={{ color: "var(--gray-700)" }}>{d}</div>
                ))}
              </div>
            </>
          ) : (
            <>
              <h3 style={{ marginBottom: 16 }}>How Call IQ helps {ind.title} businesses</h3>
              <ul style={{ marginBottom: 40, paddingLeft: 20, color: "var(--gray-600)", lineHeight: 2 }}>
                {ind.useCases.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </>
          )}

          {ind.callFlowIntro && (
            <p style={{ marginBottom: 20, color: "var(--gray-600)" }}>{ind.callFlowIntro}</p>
          )}

          {ind.qualificationQuestions && (
            <>
              <h4 style={{ marginBottom: 12 }}>The AI asks structured qualification questions about:</h4>
              <ul style={{ marginBottom: 20, paddingLeft: 20, color: "var(--gray-600)", lineHeight: 1.9 }}>
                {ind.qualificationQuestions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </>
          )}

          {ind.routingNote && (
            <p style={{ marginBottom: 20, color: "var(--gray-600)" }}>{ind.routingNote}</p>
          )}

          {ind.integrationNote && (
            <p style={{ marginBottom: 40, color: "var(--gray-600)" }}>{ind.integrationNote}</p>
          )}

          {ind.faqs && (
            <div style={{ marginBottom: 40 }}>
              <h3 style={{ marginBottom: 16 }}>Frequently asked questions for {ind.title.toLowerCase()}</h3>
              <FaqList items={ind.faqs} />
            </div>
          )}

          <div className="text-center">
            <Link href="/signup" className="btn btn-primary btn-lg">
              Start Free Trial for {ind.title} →
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
