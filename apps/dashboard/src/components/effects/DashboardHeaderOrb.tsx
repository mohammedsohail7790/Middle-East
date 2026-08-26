"use client";

/** CSS orb — avoids react-three-fiber ReactCurrentBatchConfig crashes in production. */
export function DashboardHeaderOrb() {
  return <div className="dashboard-header-orb-css" aria-hidden />;
}
