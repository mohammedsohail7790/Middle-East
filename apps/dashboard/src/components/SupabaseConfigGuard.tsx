"use client";

import { hasSupabaseConfig } from "@/lib/supabase-env";

export function SupabaseConfigGuard({ children }: { children: React.ReactNode }) {
  if (typeof window === "undefined") {
    return <>{children}</>;
  }

  if (!hasSupabaseConfig()) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-6 bg-background text-foreground">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-lg font-semibold">Configuration required</h1>
          <p className="text-sm text-muted-foreground">
            Set <code className="text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code className="text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in Vercel, then
            redeploy the dashboard.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
