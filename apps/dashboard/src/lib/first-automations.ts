/**
 * The two ready-made automations offered at the end of sign-up. Both only need the owner's email address, unlike "Add every new lead to my CRM", which needs a CRM
 * first and is left to the Automations page. They are saved in "ask first" mode, the library's default: each email waits for the owner's yes until they choose automatic.
 */
export const FIRST_AUTOMATIONS = [
  { key: "call-summary-email", name: "Email me a summary after every call", hint: "Who called, their number, how it ended and a short summary." },
  { key: "missed-call-followup", name: "Email me about missed calls", hint: "Your team is told and you get the caller's number, so nobody is forgotten." },
] as const;

export type FirstAutomationKey = (typeof FIRST_AUTOMATIONS)[number]["key"];

export const DEFAULT_FIRST_AUTOMATIONS: FirstAutomationKey[] = FIRST_AUTOMATIONS.map((a) => a.key);

export function isValidOwnerEmail(input: string): boolean {
  const v = input.trim();
  return v.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

type Save = (key: string, payload: { enabled: boolean; approvalMode: "ask"; config: Record<string, unknown> }) => Promise<unknown>;

/** Switches on the chosen automations one by one. One failing does not stop the others, and the caller learns which did not save. */
export async function saveFirstAutomations(
  save: Save,
  keys: readonly string[],
  ownerEmail: string,
): Promise<{ saved: string[]; failed: string[] }> {
  const saved: string[] = [];
  const failed: string[] = [];
  const email = ownerEmail.trim();
  for (const key of keys) {
    try {
      await save(key, { enabled: true, approvalMode: "ask", config: { ownerEmail: email } });
      saved.push(key);
    } catch {
      failed.push(key);
    }
  }
  return { saved, failed };
}
