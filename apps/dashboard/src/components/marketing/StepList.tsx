import type { TimelineStep } from "@/content/consultancy";

export function StepList({ steps }: { steps: TimelineStep[] }) {
  return (
    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((step) => (
        <div key={step.number} className="flex flex-col gap-2">
          <span className="text-3xl font-bold text-primary/40">{step.number}</span>
          <h4 className="text-lg font-semibold text-foreground">{step.title}</h4>
          <p className="text-sm text-foreground-secondary">{step.description}</p>
        </div>
      ))}
    </div>
  );
}
