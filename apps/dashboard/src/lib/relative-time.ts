/** "5m ago" in English; a proper Arabic relative phrase (Western digits, like the rest of the dashboard) in Arabic. */
export function relativeTimeLabel(iso: string, locale: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (locale === "ar") {
    const rtf = new Intl.RelativeTimeFormat("ar-u-nu-latn", { numeric: "auto" });
    if (m < 1) return rtf.format(0, "minute");
    if (m < 60) return rtf.format(-m, "minute");
    const h = Math.floor(m / 60);
    if (h < 24) return rtf.format(-h, "hour");
    return rtf.format(-Math.floor(h / 24), "day");
  }
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
