import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { IndustryPageTemplate } from "@/components/marketing/IndustryPageTemplate";
import { INDUSTRIES } from "@/content/industries";

export function generateStaticParams() {
  return INDUSTRIES.map((industry) => ({ industry: industry.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ industry: string }>;
}): Promise<Metadata> {
  const { industry: industrySlug } = await params;
  const industry = INDUSTRIES.find((i) => i.slug === industrySlug);
  return { title: industry ? `Halla AI for ${industry.name}` : "Industry Not Found" };
}

export default async function IndustryDetailPage({ params }: { params: Promise<{ industry: string }> }) {
  const { industry: industrySlug } = await params;
  const industry = INDUSTRIES.find((i) => i.slug === industrySlug);
  if (!industry) {
    notFound();
  }

  return (
    <div data-brand="receptionist" className="min-h-screen bg-background">
      <IndustryPageTemplate industry={industry} />
    </div>
  );
}
