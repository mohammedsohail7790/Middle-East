import { pagePath } from "@/lib/marketing-routes";

/**
 * Scripts inside HTML set with innerHTML never run, so the currency converter and the Ruby calculator in marketing-body.html were silently dead.
 * Re-create each classic inline script so it runs. Module scripts (the decorative 3D backdrops) are skipped on purpose: they load separately.
 */
export function runInlineScripts(root: HTMLElement) {
  root.querySelectorAll("script").forEach((old) => {
    if (old.src || (old.type && old.type !== "text/javascript")) return;
    const fresh = document.createElement("script");
    fresh.text = old.text;
    old.replaceWith(fresh);
  });
}

/**
 * Menu and button links are written as script calls (href="javascript:void(0)"), which search engines cannot follow and visitors cannot open in a new tab.
 * Give each one its real web address. A plain click is still handled by the page script, so there is no reload.
 */
export function linkifyPages(root: HTMLElement) {
  root.querySelectorAll<HTMLAnchorElement>('a[onclick]').forEach((a) => {
    const call = a.getAttribute("onclick") ?? "";
    const m = /^\s*(go|goSol|switchSection)\('([a-z0-9-]+)'\)/.exec(call);
    if (!m) return;
    let page: string | null = null;
    if (m[1] === "go") page = m[2] === "industries" ? "industries-all" : m[2];
    else if (m[1] === "goSol") page = `solutions-${m[2]}`;
    else page = ({ consultancy: "consultancy", receptionist: "home", intelligence: "intelligence" } as Record<string, string>)[m[2]] ?? null;
    if (!page) return;
    const path = page === "signup" || page === "login" ? `/${page}` : pagePath(page);
    if (path) a.setAttribute("href", path);
  });
}

/** Browser tab title for a page: its own headline, then the brand. */
export function titleForPage(page: string): string | null {
  const h1 = document.querySelector<HTMLElement>(`#page-${page} h1`);
  const text = h1?.innerText.replace(/\s+/g, " ").trim();
  return text ? `${text} | Halla AI` : null;
}

