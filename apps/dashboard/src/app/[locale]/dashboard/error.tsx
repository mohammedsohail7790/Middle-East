"use client";

import { useEffect } from "react";
import { Link } from "@/i18n/navigation";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard]", error);
  }, [error]);

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 text-center">
      <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-md">
        {error.message || "This page hit an unexpected error. Your session is still active."}
      </p>
      <div className="flex flex-wrap gap-3 mt-6 justify-center">
        <button type="button" className="btn-primary" onClick={() => reset()}>
          Try again
        </button>
        <Link href="/dashboard" className="btn-ghost">
          Back to home
        </Link>
      </div>
    </div>
  );
}
