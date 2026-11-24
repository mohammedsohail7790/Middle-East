const FUNNEL_KEYS: Record<string, string> = {
  Calls: "funnelCalls",
  Leads: "funnelLeads",
  Converted: "funnelConverted",
  Qualified: "funnelQualified",
  Appointments: "funnelAppointments",
  Confirmed: "funnelConfirmed",
};

/** Translates the funnel step names the app produces (message namespace pages.analytics); anything else is shown as it comes. */
export function translateFunnelName(
  name: string,
  t: { has: (key: string) => boolean; (key: string): string }
): string {
  const key = FUNNEL_KEYS[name];
  return key && t.has(key) ? t(key) : name;
}
