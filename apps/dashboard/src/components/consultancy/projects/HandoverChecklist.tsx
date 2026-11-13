"use client";

import { HANDOVER_LABEL, type Handover, type HandoverKey } from "./types";

/** The four things the client owns at the end: code, data, accounts, documentation. All four must be ticked before a project can be marked delivered. */
export function HandoverChecklist({ handover, onChange, disabled }: { handover: Handover; onChange: (key: HandoverKey, value: boolean) => void; disabled?: boolean }) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-semibold">Handover checklist</legend>
      {(Object.keys(HANDOVER_LABEL) as HandoverKey[]).map((k) => (
        <label key={k} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={handover[k]} onChange={(e) => onChange(k, e.target.checked)} />
          {HANDOVER_LABEL[k]}
        </label>
      ))}
    </fieldset>
  );
}
