"use client";

import { FIRST_AUTOMATIONS, isValidOwnerEmail, type FirstAutomationKey } from "@/lib/first-automations";

type Props = {
  selected: FirstAutomationKey[];
  email: string;
  failedNote: string | null;
  onSelectedChange: (next: FirstAutomationKey[]) => void;
  onEmailChange: (next: string) => void;
};

/** "Switch on your first automations": two ready-made ones that only need the owner's email address. Optional. */
export function OnboardingFirstAutomations({ selected, email, failedNote, onSelectedChange, onEmailChange }: Props) {
  const toggle = (key: FirstAutomationKey) =>
    onSelectedChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  const emailProblem = selected.length > 0 && email.trim() !== "" && !isValidOwnerEmail(email);

  return (
    <div className="py-4 space-y-4">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-bold">Switch on your first automations</h2>
        <p className="text-foreground-secondary max-w-sm mx-auto text-sm">
          These start working once your phone line takes calls. Each email waits for your approval until you set it to automatic on the Automations page. This is optional.
        </p>
      </div>
      <ul className="space-y-2 text-left">
        {FIRST_AUTOMATIONS.map((a) => (
          <li key={a.key}>
            <label className="flex items-start gap-3 rounded-xl border border-border px-3 py-2.5 cursor-pointer">
              <input type="checkbox" checked={selected.includes(a.key)} onChange={() => toggle(a.key)} className="mt-1" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{a.name}</span>
                <span className="block text-xs text-foreground-secondary">{a.hint}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {selected.length > 0 && (
        <div className="text-left">
          <label htmlFor="onboarding-owner-email" className="text-sm text-foreground-secondary mb-1.5 block">
            Where should the emails go?
          </label>
          <input
            id="onboarding-owner-email"
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="you@company.com"
            className="input"
          />
          {emailProblem && <p className="mt-1 text-xs text-red-600">Enter a valid email address.</p>}
        </div>
      )}
      {failedNote && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 text-left">{failedNote}</div>
      )}
    </div>
  );
}
