/** Shows a subscription status (active, trialing, past_due...) in the interface language; unknown statuses are shown as they come. Message key: billing.subStatus.<status>. */
export function subscriptionStatusLabel(
  status: string | undefined | null,
  t: { has: (key: string) => boolean; (key: string): string }
): string {
  const s = String(status ?? "");
  const key = `subStatus.${s}`;
  return s && t.has(key) ? t(key) : s;
}
