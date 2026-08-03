"use client";

import { useEffect } from "react";
import { Users, RefreshCw } from "lucide-react";
import Link from "next/link";

export default function LeadsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[leads]", error);
  }, [error]);

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
        <Users className="w-6 h-6 text-red-600" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">Could not load leads</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-md">
        {error.message || "There was a problem loading your leads. New leads from calls are still being captured."}
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
