import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ComparisonRow } from "@/content/types";

export function ComparisonTable({
  rows,
  competitorLabel,
}: {
  rows: ComparisonRow[];
  competitorLabel: string;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="p-4 font-semibold text-foreground-secondary">What you need</th>
            <th className="p-4 font-semibold text-primary">{competitorLabel}</th>
            <th className="p-4 font-semibold text-foreground-secondary">Doing it yourself</th>
            <th className="p-4 font-semibold text-foreground-secondary">Traditional agency</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.need} className="border-b border-border last:border-0">
              <td className="p-4 font-medium text-foreground">{row.need}</td>
              <td className="p-4 text-foreground">
                <span className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  {row.hallaAi}
                </span>
              </td>
              <td className="p-4 text-foreground-secondary">{row.diy}</td>
              <td className={cn("p-4 text-foreground-secondary", row.agencyNegative && "text-accent")}>
                {row.agency}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
