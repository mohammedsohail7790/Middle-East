"use client";

import { useTranslations } from "next-intl";
import type { ConfigField } from "./types";

const INPUT = "flex h-11 w-full rounded-xl border border-input bg-[var(--surface-inset)] px-3.5 py-2 text-[15px] text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent)]/20 disabled:opacity-50";

/** The settings form, built from the template's fields. */
export function ConfigForm({
  fields, values, onChange, disabled,
}: {
  fields: ConfigField[];
  values: Record<string, string | boolean>;
  onChange: (key: string, value: string | boolean) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("pages.automations.config");
  return (
    <div className="space-y-4">
      {fields.map((f) => {
        const id = `automation-field-${f.key}`;
        const helpId = f.help ? `${id}-help` : undefined;
        const label = (
          <>
            {f.label}
            {f.required && (
              <span className="ms-1 text-red-600" title={t("required")}>
                *<span className="sr-only"> ({t("required")})</span>
              </span>
            )}
          </>
        );
        const common = { id, disabled, "aria-describedby": helpId, "aria-required": f.required || undefined };
        return (
          <div key={f.key}>
            {f.type === "boolean" ? (
              <label htmlFor={id} className="flex items-start gap-3 text-sm font-medium text-foreground">
                <input
                  {...common}
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0"
                  checked={values[f.key] === true}
                  onChange={(e) => onChange(f.key, e.target.checked)}
                />
                <span>{label}</span>
              </label>
            ) : (
              <>
                <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-foreground">{label}</label>
                {f.type === "select" ? (
                  <select {...common} className={INPUT} value={String(values[f.key] ?? "")} onChange={(e) => onChange(f.key, e.target.value)}>
                    {!f.required && <option value="">{t("choose")}</option>}
                    {f.required && !values[f.key] && <option value="">{t("choose")}</option>}
                    {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input
                    {...common}
                    className={INPUT}
                    type={f.type === "number" ? "number" : f.type === "email" ? "email" : f.type === "url" ? "url" : "text"}
                    dir={f.type === "email" || f.type === "url" ? "ltr" : undefined}
                    value={String(values[f.key] ?? "")}
                    onChange={(e) => onChange(f.key, e.target.value)}
                  />
                )}
              </>
            )}
            {f.help && <p id={helpId} className="mt-1.5 text-xs text-muted-foreground">{f.help}</p>}
          </div>
        );
      })}
    </div>
  );
}
