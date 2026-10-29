/**
 * Server-side snapshot of one marketing page.
 *
 * The marketing site is a single-page app: MarketingSPA fills #marketing-spa-root with the whole of public/marketing-body.html in the browser, so the HTML a search engine,
 * an AI crawler or a link preview first receives is an empty container (about eleven visible words). This cuts one page's block out of that file so the server can send
 * real text and headings; the browser still replaces it with the full app as before.
 */
export function extractPageHtml(bodyHtml: string, pageId: string): string {
  const id = pageId.replace(/[^a-z0-9-]/gi, "");
  if (!id) return "";
  const start = bodyHtml.indexOf(`<div id="page-${id}"`);
  if (start === -1) return "";
  const after = start + 1;
  const nextPage = bodyHtml.indexOf('<div id="page-', after);
  const nextMarker = bodyHtml.indexOf("<!-- ======", after);
  const ends = [nextPage, nextMarker].filter((i) => i !== -1);
  const end = ends.length ? Math.min(...ends) : bodyHtml.length;
  const block = bodyHtml.slice(start, end);
  // .page is display:none until it is .active, so the snapshot must carry the class to be visible.
  return block.replace(/^<div id="page-[a-z0-9-]+" class="page(?: active)?"/i, (m) => (m.includes("active") ? m : `${m.slice(0, -1)} active"`));
}
