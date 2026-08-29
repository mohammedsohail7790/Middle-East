import type { FeatureComparisonRow } from "@/content/pricing";

export function PricingFeatureTable({ rows }: { rows: FeatureComparisonRow[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="p-4 font-semibold text-foreground-secondary">Feature</th>
            <th className="p-4 font-semibold text-foreground-secondary">Essential</th>
            <th className="p-4 font-semibold text-primary">Professional</th>
            <th className="p-4 font-semibold text-foreground-secondary">Enterprise</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.feature} className="border-b border-border last:border-0">
              <td className="p-4 font-medium text-foreground">{row.feature}</td>
              <td className="p-4 text-foreground-secondary">{row.essential}</td>
              <td className="p-4 text-foreground">{row.professional}</td>
              <td className="p-4 text-foreground-secondary">{row.enterprise}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
