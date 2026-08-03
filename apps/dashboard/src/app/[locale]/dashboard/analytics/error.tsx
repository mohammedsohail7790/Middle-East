"use client";

import { useEffect } from "react";
import { BarChart2, RefreshCw } from "lucide-react";
import { Link } from "@/i18n/navigation";

export default function AnalyticsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[analytics]", error);
  }, [error]);

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
        <BarChart2 className="w-6 h-6 text-red-600" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">Analytics temporarily unavailable</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-md">
        {error.message || "Could not load analytics data. Your call data is still being collected."}
      </p>
      <div className="flex flex-wrap gap-3 mt-6 justify-center">
        <button type="button" className="btn-primary flex items-center gap-2" onClick={() => reset()}>
          <RefreshCw className="w-4 h-4" />
          Try again
        </button>
        <Link href="/dashboard" className="btn-ghost">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
