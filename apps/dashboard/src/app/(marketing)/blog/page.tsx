import Link from "next/link";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { BLOG_POSTS } from "@/lib/marketing-pages";

export const metadata = { title: "Blog | Call IQ" };
// Force per-request rendering — static generation intermittently froze this
// page's Suspense boundary mid-stream (content correct but hidden forever).
export const dynamic = "force-dynamic";

export default function BlogPage() {
  return (
    <MarketingShell>
      <PageHero label="Blog" title="Call IQ Blog" subtitle="Insights on AI receptionists, call handling, and growth." />
      <section className="section">
        <div className="container">
          <div className="grid-3">
            {BLOG_POSTS.map((post) => (
              <Link key={post.title} href={post.href} className="card" style={{ textDecoration: "none", display: "block" }}>
                <div
                  style={{
                    background: "var(--gray-100)",
                    borderRadius: "var(--radius)",
                    padding: 24,
                    textAlign: "center",
                    fontSize: "2rem",
                    marginBottom: 18,
                  }}
                >
                  {post.emoji}
                </div>
                <div
                  style={{
                    fontSize: "0.72rem",
                    color: "var(--accent)",
                    fontWeight: 700,
                    marginBottom: 8,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {post.date}
                </div>
                <h4 style={{ marginBottom: 10, color: "var(--black)" }}>{post.title}</h4>
                <p style={{ fontSize: "0.875rem" }}>{post.desc}</p>
                <div style={{ marginTop: 16, color: "var(--accent)", fontSize: "0.875rem", fontWeight: 600 }}>
                  Read Article →
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
