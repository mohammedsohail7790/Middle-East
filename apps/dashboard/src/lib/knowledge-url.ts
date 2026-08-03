/** Normalize user-pasted site URLs before knowledge import. */
export function normalizeKnowledgeImportUrl(raw: string): string {
  let url = raw.trim();
  if (!url) {
    throw new Error("Enter a website URL to import.");
  }
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  try {
    const parsed = new URL(url);
    if (!parsed.hostname || !parsed.hostname.includes(".")) {
      throw new Error("Enter a full URL (e.g. https://yourcompany.com/pricing)");
    }
    return parsed.toString();
  } catch {
    throw new Error("Invalid URL — use https://yourcompany.com/page");
  }
}
