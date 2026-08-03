export type BlogArticle = {
  slug: string;
  title: string;
  /** e.g. "Published March 1, 2025 · 5 min read" */
  date: string;
  subtitle: string;
  /** Trusted static article markup authored in the marketing SPA (index.html). */
  bodyHtml: string;
};
