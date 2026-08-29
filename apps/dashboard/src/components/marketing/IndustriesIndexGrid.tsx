import Link from "next/link";

import { INDUSTRIES, PLACEHOLDER_CATEGORIES } from "@/content/industries";

export function IndustriesIndexGrid() {
  return (
    <div className="flex flex-col gap-12">
      <div>
        <p className="mb-5 text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
          Trades & Services
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {INDUSTRIES.map((industry) => (
            <Link
              key={industry.slug}
              href={`/design-preview/receptionist/industries/${industry.slug}`}
              className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary"
            >
              <h4 className="text-sm font-semibold text-foreground">{industry.name}</h4>
              <p className="mt-1 text-xs text-foreground-secondary">{industry.tagline}</p>
            </Link>
          ))}
        </div>
      </div>

      {PLACEHOLDER_CATEGORIES.map((category) => (
        <div key={category.heading}>
          <p className="mb-5 text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
            {category.heading}
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {category.items.map((item) => (
              <div key={item.label} className="rounded-xl border border-border p-4 opacity-70">
                <h4 className="text-sm font-semibold text-foreground">{item.label}</h4>
                <p className="mt-1 text-xs text-foreground-secondary">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
