import { pagePath } from "@/lib/marketing-routes";

/** Pages that must never be listed for search engines: private links, sign-in and the sign-up hand-off. */
const PRIVATE_PAGES = new Set(["audit", "audit-pay", "audit-paid", "signup", "login"]);

/** Every public marketing page in marketing-body.html that has a web address, as a path, in a stable order. */
export function sitemapPaths(bodyHtml: string): string[] {
  const ids = [...bodyHtml.matchAll(/<div id="page-([a-z0-9-]+)"/g)].map((m) => m[1]);
  const paths: string[] = [];
  for (const id of ids) {
    if (PRIVATE_PAGES.has(id)) continue;
    const path = pagePath(id);
    if (path && !paths.includes(path)) paths.push(path);
  }
  return paths;
}
