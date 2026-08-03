"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { IntegrationField } from "@/lib/integration-hub-catalog";

type PlainOverrides = {
  label?: string;
  placeholder?: string;
  helpTitle?: string;
  helpBody?: string;
};

type Props = {
  field: IntegrationField;
  value: string;
  onChange: (value: string) => void;
  showHelp: boolean;
  plain?: PlainOverrides;
};

export function IntegrationCredentialField({ field, value, onChange, showHelp, plain }: Props) {
  const [copied, setCopied] = useState(false);

  const copyExample = () => {
    if (!field.example) return;
    void navigator.clipboard.writeText(field.example).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const label = plain?.label ?? field.label;
  const placeholder = plain?.placeholder ?? field.placeholder;
  const helpTitle = plain?.helpTitle ?? field.helpTitle;
  const helpBody = plain?.helpBody ?? field.helpBody;
  const fieldId = `integration-field-${field.key}`;

  return (
    <div className="space-y-2">
      {showHelp && (helpTitle || helpBody) && (
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
          {helpTitle && <p className="font-medium text-foreground">{helpTitle}</p>}
          {helpBody && <p className="text-muted-foreground mt-1">{helpBody}</p>}
        </div>
      )}
      <label htmlFor={fieldId} className="dashboard-label">{label}</label>
      {field.type === "select" ? (
        <select
          id={fieldId}
          className="input w-full"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={fieldId}
          type={field.type === "url" ? "url" : field.type}
          className="input w-full"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {field.example && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>e.g.</span>
          <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-foreground/80 text-[11px]">
            {field.example}
          </code>
          <button
            type="button"
            onClick={copyExample}
            className="inline-flex items-center gap-0.5 hover:text-foreground transition-colors"
          >
            {copied ? (
              <Check className="size-3 text-emerald-600" />
            ) : (
              <Copy className="size-3" />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}
