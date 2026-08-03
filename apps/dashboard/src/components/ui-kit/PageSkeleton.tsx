"use client";

export function PageSkeleton({ statCount = 4 }: { statCount?: number }) {
  return (
    <div className="space-y-6 min-w-0" aria-hidden>
      <div className="dashboard-stat-grid">
        {Array.from({ length: statCount }).map((_, i) => (
          <div key={i} className="dashboard-skeleton dashboard-skeleton-stat" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-w-0">
        <div className="dashboard-skeleton dashboard-skeleton-panel lg:col-span-2 h-64 sm:h-72" />
        <div className="dashboard-skeleton dashboard-skeleton-panel h-64 sm:h-72" />
      </div>
      <div className="dashboard-skeleton dashboard-skeleton-panel h-48 sm:h-56" />
    </div>
  );
}
