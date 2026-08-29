import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type Stat = {
  value: string;
  label: string;
  accent?: boolean;
};

export function StatBar({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="p-4 text-center">
            <div className={cn("text-2xl font-bold text-foreground", stat.accent && "text-primary")}>
              {stat.value}
            </div>
            <div className="mt-1 text-xs text-foreground-secondary">{stat.label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
