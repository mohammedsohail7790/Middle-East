import { notFound } from "next/navigation";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { BLOG_ARTICLES, getBlogArticle } from "@/lib/blog";

export function generateStaticParams() {
  return BLOG_ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getBlogArticle(slug);
  if (!article) return { title: "Blog | Call IQ" };
  return {
    title: `${article.title} | Call IQ Blog`,
    description: article.subtitle,
  };
}

export default async function BlogArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getBlogArticle(slug);
  if (!article) notFound();

  return (
    <MarketingShell>
      <div className="page-hero">
        <div className="container text-center">
          <div className="label">Blog</div>
          <h1>{article.title}</h1>
          <p style={{ marginTop: 8, fontSize: "0.9rem", color: "var(--gray-400)" }}>{article.date}</p>
          {article.subtitle && (
            <p
              style={{
                marginTop: 12,
                fontSize: "1.05rem",
                maxWidth: 600,
                marginLeft: "auto",
                marginRight: "auto",
                color: "var(--gray-600)",
              }}
            >
              {article.subtitle}
            </p>
          )}
        </div>
      </div>
      {/* Static, first-party article markup authored in the marketing SPA — not user input. */}
      <div dangerouslySetInnerHTML={{ __html: article.bodyHtml }} />
    </MarketingShell>
  );
}
