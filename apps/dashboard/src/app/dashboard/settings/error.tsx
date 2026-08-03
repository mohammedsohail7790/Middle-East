"use client";

import { useEffect } from "react";
import { Settings, RefreshCw } from "lucide-react";
import Link from "next/link";

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[settings]", error);
  }, [error]);

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
        <Settings className="w-6 h-6 text-red-600" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">Settings unavailable</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-md">
        {error.message || "Could not load settings. Your existing configuration is unchanged."}
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
