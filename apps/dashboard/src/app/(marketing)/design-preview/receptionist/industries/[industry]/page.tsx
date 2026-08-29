import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { IndustryPageTemplate } from "@/components/marketing/IndustryPageTemplate";
import { INDUSTRIES } from "@/content/industries";

export function generateStaticParams() {
  return INDUSTRIES.map((industry) => ({ industry: industry.slug }));
}

export function generateMetadata({
  params,
}: {
  params: { industry: string };
}): Metadata {
  const industry = INDUSTRIES.find((i) => i.slug === params.industry);
  return { title: industry ? `Halla AI for ${industry.name}` : "Industry Not Found" };
}

export default function IndustryDetailPage({ params }: { params: { industry: string } }) {
  const industry = INDUSTRIES.find((i) => i.slug === params.industry);
  if (!industry) {
    notFound();
  }

  return (
    <div data-brand="receptionist" className="min-h-screen bg-background">
      <IndustryPageTemplate industry={industry} />
    </div>
  );
}
